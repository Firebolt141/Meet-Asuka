package com.meetasuka;

import android.content.ContentProviderOperation;
import android.content.ContentProviderResult;
import android.content.ContentResolver;
import android.content.ContentUris;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;

/**
 * Fast calendar access for the Google Calendar sync: listing a calendar's
 * events in one query (with low-level details for diagnosing sync issues) and
 * applying all inserts/deletes/color changes in batched transactions, with
 * colors set the way Google Calendar stores them (a color key from the
 * account's palette). Calendar permission is requested by the calendar plugin
 * before these are called.
 */
@CapacitorPlugin(name = "CalendarTools")
public class CalendarToolsPlugin extends Plugin {

    /**
     * Lists events (one-off events and recurring series, not their
     * exceptions) that aren't deleted, in one calendar or in all calendars.
     */
    @PluginMethod
    public void listEvents(PluginCall call) {
        String calendarId = call.getString("calendarId");
        try {
            ContentResolver cr = getContext().getContentResolver();
            String[] projection = new String[] {
                CalendarContract.Events._ID,
                CalendarContract.Events.CALENDAR_ID,
                CalendarContract.Events.TITLE,
                CalendarContract.Events.DESCRIPTION,
                CalendarContract.Events.DTSTART,
                CalendarContract.Events.ALL_DAY,
                CalendarContract.Events.RRULE,
                CalendarContract.Events._SYNC_ID,
                CalendarContract.Events.DIRTY,
                CalendarContract.Events.ORGANIZER,
                CalendarContract.Events.ACCOUNT_TYPE,
                CalendarContract.Events.CALENDAR_DISPLAY_NAME,
                CalendarContract.Events.EVENT_COLOR_KEY,
            };
            String selection = CalendarContract.Events.DELETED + "=0 AND " + CalendarContract.Events.ORIGINAL_ID + " IS NULL";
            String[] args = null;
            if (calendarId != null) {
                selection += " AND " + CalendarContract.Events.CALENDAR_ID + "=?";
                args = new String[] { calendarId };
            }
            JSArray rows = new JSArray();
            Cursor c = cr.query(CalendarContract.Events.CONTENT_URI, projection, selection, args, null);
            if (c != null) {
                while (c.moveToNext()) {
                    JSObject row = new JSObject();
                    row.put("id", c.getString(0));
                    row.put("calendarId", c.getString(1));
                    row.put("title", c.getString(2));
                    row.put("description", c.getString(3));
                    row.put("dtstart", c.getLong(4));
                    row.put("allDay", c.getInt(5) == 1);
                    row.put("rrule", c.getString(6));
                    row.put("syncId", c.getString(7));
                    row.put("dirty", c.getInt(8));
                    row.put("organizer", c.getString(9));
                    row.put("accountType", c.getString(10));
                    row.put("calendarName", c.getString(11));
                    row.put("colorKey", c.getString(12));
                    rows.put(row);
                }
                c.close();
            }
            JSObject result = new JSObject();
            result.put("events", rows);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to list events: " + e.getMessage());
        }
    }

    /**
     * Applies a sync's changes in batched transactions: deletes events,
     * inserts events (with reminders and color) into calendarId, and recolors
     * events. Returns the new event ids in insert order (null for any insert
     * whose batch failed).
     */
    @PluginMethod
    public void applyChanges(PluginCall call) {
        String calendarId = call.getString("calendarId");
        JSArray deletes = call.getArray("deletes", new JSArray());
        JSArray inserts = call.getArray("inserts", new JSArray());
        JSArray recolors = call.getArray("recolors", new JSArray());
        ContentResolver cr = getContext().getContentResolver();
        JSArray errors = new JSArray();
        int deleted = 0;
        JSArray insertedIds = new JSArray();

        try {
            Set<String> colorKeys = calendarId != null ? eventColorKeysForCalendar(cr, calendarId) : new HashSet<String>();

            // Deletes and recolors: one batch.
            ArrayList<ContentProviderOperation> ops = new ArrayList<>();
            for (int i = 0; i < deletes.length(); i++) {
                ops.add(ContentProviderOperation
                    .newDelete(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, Long.parseLong(deletes.getString(i))))
                    .build());
            }
            for (int i = 0; i < recolors.length(); i++) {
                JSONObject recolor = recolors.getJSONObject(i);
                ContentProviderOperation.Builder update = ContentProviderOperation
                    .newUpdate(ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, Long.parseLong(recolor.getString("id"))));
                putColor(update, recolor, colorKeys);
                ops.add(update.build());
            }
            if (!ops.isEmpty()) {
                try {
                    ContentProviderResult[] results = cr.applyBatch(CalendarContract.AUTHORITY, ops);
                    for (int i = 0; i < deletes.length() && i < results.length; i++) {
                        if (results[i].count != null) deleted += results[i].count;
                    }
                } catch (Exception e) {
                    errors.put("delete/recolor batch: " + e.getMessage());
                }
            }

            // Inserts: each event and its reminders stay in the same batch.
            final int perBatch = 25;
            for (int start = 0; start < inserts.length(); start += perBatch) {
                int end = Math.min(inserts.length(), start + perBatch);
                ArrayList<ContentProviderOperation> batch = new ArrayList<>();
                int[] eventOpIndex = new int[end - start];
                for (int i = start; i < end; i++) {
                    JSONObject insert = inserts.getJSONObject(i);
                    eventOpIndex[i - start] = batch.size();
                    ContentProviderOperation.Builder event = ContentProviderOperation
                        .newInsert(CalendarContract.Events.CONTENT_URI)
                        .withValue(CalendarContract.Events.CALENDAR_ID, Long.parseLong(calendarId))
                        .withValue(CalendarContract.Events.TITLE, insert.optString("title"))
                        .withValue(CalendarContract.Events.DESCRIPTION, insert.optString("description"))
                        .withValue(CalendarContract.Events.DTSTART, insert.getLong("dtstart"))
                        .withValue(CalendarContract.Events.ALL_DAY, insert.optBoolean("allDay") ? 1 : 0)
                        .withValue(CalendarContract.Events.EVENT_TIMEZONE, insert.optString("timezone", "UTC"));
                    if (insert.has("location") && !insert.isNull("location")) {
                        event.withValue(CalendarContract.Events.EVENT_LOCATION, insert.getString("location"));
                    }
                    if (insert.has("rrule") && !insert.isNull("rrule")) {
                        event.withValue(CalendarContract.Events.RRULE, insert.getString("rrule"));
                        event.withValue(CalendarContract.Events.DURATION, insert.getString("duration"));
                    } else {
                        event.withValue(CalendarContract.Events.DTEND, insert.getLong("dtend"));
                    }
                    JSONArray reminders = insert.optJSONArray("reminders");
                    boolean hasReminders = reminders != null && reminders.length() > 0;
                    event.withValue(CalendarContract.Events.HAS_ALARM, hasReminders ? 1 : 0);
                    putColor(event, insert, colorKeys);
                    batch.add(event.build());
                    if (hasReminders) {
                        for (int r = 0; r < reminders.length(); r++) {
                            batch.add(ContentProviderOperation
                                .newInsert(CalendarContract.Reminders.CONTENT_URI)
                                .withValueBackReference(CalendarContract.Reminders.EVENT_ID, eventOpIndex[i - start])
                                .withValue(CalendarContract.Reminders.MINUTES, reminders.getInt(r))
                                .withValue(CalendarContract.Reminders.METHOD, CalendarContract.Reminders.METHOD_ALERT)
                                .build());
                        }
                    }
                }
                try {
                    ContentProviderResult[] results = cr.applyBatch(CalendarContract.AUTHORITY, batch);
                    for (int i = start; i < end; i++) {
                        Uri uri = results[eventOpIndex[i - start]].uri;
                        insertedIds.put(uri != null ? uri.getLastPathSegment() : JSONObject.NULL);
                    }
                } catch (Exception e) {
                    errors.put("insert batch: " + e.getMessage());
                    for (int i = start; i < end; i++) insertedIds.put(JSONObject.NULL);
                }
            }

            JSObject result = new JSObject();
            result.put("insertedIds", insertedIds);
            result.put("deleted", deleted);
            result.put("errors", errors);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to apply calendar changes: " + e.getMessage());
        }
    }

    /** Sets the event color: Google's color key when the account has it, else the raw color. */
    private void putColor(ContentProviderOperation.Builder builder, JSONObject source, Set<String> colorKeys) {
        String colorKey = source.optString("colorKey", null);
        String hex = source.optString("color", null);
        if (colorKey != null && colorKeys.contains(colorKey)) {
            builder.withValue(CalendarContract.Events.EVENT_COLOR_KEY, colorKey);
        } else if (hex != null) {
            builder.withValue(CalendarContract.Events.EVENT_COLOR, (int) Long.parseLong(hex.replace("#", ""), 16) | 0xFF000000);
        }
    }

    private Set<String> eventColorKeysForCalendar(ContentResolver cr, String calendarId) {
        Set<String> keys = new HashSet<>();
        String accountName = null;
        String accountType = null;
        Cursor cal = cr.query(
            ContentUris.withAppendedId(CalendarContract.Calendars.CONTENT_URI, Long.parseLong(calendarId)),
            new String[] { CalendarContract.Calendars.ACCOUNT_NAME, CalendarContract.Calendars.ACCOUNT_TYPE },
            null,
            null,
            null
        );
        if (cal != null) {
            if (cal.moveToFirst()) {
                accountName = cal.getString(0);
                accountType = cal.getString(1);
            }
            cal.close();
        }
        if (accountName == null || accountType == null) return keys;
        Cursor colors = cr.query(
            CalendarContract.Colors.CONTENT_URI,
            new String[] { CalendarContract.Colors.COLOR_KEY },
            CalendarContract.Colors.ACCOUNT_NAME + "=? AND " +
                CalendarContract.Colors.ACCOUNT_TYPE + "=? AND " +
                CalendarContract.Colors.COLOR_TYPE + "=?",
            new String[] { accountName, accountType, String.valueOf(CalendarContract.Colors.TYPE_EVENT) },
            null
        );
        if (colors != null) {
            while (colors.moveToNext()) keys.add(colors.getString(0));
            colors.close();
        }
        return keys;
    }
}
