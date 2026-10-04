package com.meetasuka;

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

import org.json.JSONException;

/**
 * Small helpers for the Google Calendar sync that the calendar plugin doesn't
 * cover: setting an event color the way Google Calendar stores it (a color
 * key from the account's palette) and reading low-level event details for
 * diagnosing sync issues. Calendar permission is requested by the calendar
 * plugin before these are called.
 */
@CapacitorPlugin(name = "CalendarTools")
public class CalendarToolsPlugin extends Plugin {

    /**
     * Sets an event's color. Uses the account's event color key (Google's
     * colorId, "1".."11") when the account has one, so the color syncs to
     * Google Calendar; otherwise sets the raw color on this device only.
     */
    @PluginMethod
    public void setEventColor(PluginCall call) {
        String eventId = call.getString("eventId");
        String colorKey = call.getString("colorKey");
        String fallbackHex = call.getString("color");
        if (eventId == null) {
            call.reject("eventId is required");
            return;
        }
        try {
            ContentResolver cr = getContext().getContentResolver();
            long id = Long.parseLong(eventId);
            Uri eventUri = ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, id);

            String accountName = null;
            String accountType = null;
            Cursor event = cr.query(
                eventUri,
                new String[] { CalendarContract.Events.ACCOUNT_NAME, CalendarContract.Events.ACCOUNT_TYPE },
                null,
                null,
                null
            );
            if (event != null) {
                if (event.moveToFirst()) {
                    accountName = event.getString(0);
                    accountType = event.getString(1);
                }
                event.close();
            }

            ContentValues values = new ContentValues();
            boolean usedKey = false;
            if (colorKey != null && accountName != null && accountType != null && hasEventColorKey(cr, accountName, accountType, colorKey)) {
                values.put(CalendarContract.Events.EVENT_COLOR_KEY, colorKey);
                usedKey = true;
            } else if (fallbackHex != null) {
                values.put(CalendarContract.Events.EVENT_COLOR, (int) Long.parseLong(fallbackHex.replace("#", ""), 16) | 0xFF000000);
            } else {
                values.putNull(CalendarContract.Events.EVENT_COLOR_KEY);
                values.putNull(CalendarContract.Events.EVENT_COLOR);
            }
            int updated = cr.update(eventUri, values, null, null);

            JSObject result = new JSObject();
            result.put("updated", updated);
            result.put("usedKey", usedKey);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to set event color: " + e.getMessage());
        }
    }

    private boolean hasEventColorKey(ContentResolver cr, String accountName, String accountType, String colorKey) {
        Cursor colors = cr.query(
            CalendarContract.Colors.CONTENT_URI,
            new String[] { CalendarContract.Colors.COLOR_KEY },
            CalendarContract.Colors.ACCOUNT_NAME + "=? AND " +
                CalendarContract.Colors.ACCOUNT_TYPE + "=? AND " +
                CalendarContract.Colors.COLOR_TYPE + "=? AND " +
                CalendarContract.Colors.COLOR_KEY + "=?",
            new String[] {
                accountName,
                accountType,
                String.valueOf(CalendarContract.Colors.TYPE_EVENT),
                colorKey
            },
            null
        );
        if (colors == null) return false;
        boolean found = colors.moveToFirst();
        colors.close();
        return found;
    }

    /** Low-level details of events by id, for diagnosing sync issues. */
    @PluginMethod
    public void inspectEvents(PluginCall call) {
        JSArray ids = call.getArray("ids");
        JSArray rows = new JSArray();
        if (ids == null) {
            call.reject("ids is required");
            return;
        }
        try {
            ContentResolver cr = getContext().getContentResolver();
            String[] projection = new String[] {
                CalendarContract.Events._ID,
                CalendarContract.Events.CALENDAR_ID,
                CalendarContract.Events.TITLE,
                CalendarContract.Events.DESCRIPTION,
                CalendarContract.Events._SYNC_ID,
                CalendarContract.Events.DIRTY,
                CalendarContract.Events.DELETED,
                CalendarContract.Events.ORGANIZER,
                CalendarContract.Events.ACCOUNT_NAME,
                CalendarContract.Events.ACCOUNT_TYPE,
                CalendarContract.Events.CALENDAR_DISPLAY_NAME,
                CalendarContract.Events.RRULE,
                CalendarContract.Events.ORIGINAL_ID,
                CalendarContract.Events.EVENT_COLOR_KEY,
            };
            for (int i = 0; i < ids.length(); i++) {
                String rawId = ids.getString(i);
                JSObject row = new JSObject();
                row.put("id", rawId);
                Cursor c = cr.query(
                    ContentUris.withAppendedId(CalendarContract.Events.CONTENT_URI, Long.parseLong(rawId)),
                    projection,
                    null,
                    null,
                    null
                );
                if (c != null) {
                    if (c.moveToFirst()) {
                        row.put("found", true);
                        row.put("calendarId", c.getString(1));
                        row.put("title", c.getString(2));
                        String description = c.getString(3);
                        row.put("descriptionLength", description == null ? -1 : description.length());
                        row.put("syncId", c.getString(4));
                        row.put("dirty", c.getInt(5));
                        row.put("deleted", c.getInt(6));
                        row.put("organizer", c.getString(7));
                        row.put("accountName", c.getString(8));
                        row.put("accountType", c.getString(9));
                        row.put("calendarName", c.getString(10));
                        row.put("rrule", c.getString(11));
                        row.put("originalId", c.getString(12));
                        row.put("colorKey", c.getString(13));
                    } else {
                        row.put("found", false);
                    }
                    c.close();
                } else {
                    row.put("found", false);
                }
                rows.put(row);
            }
            JSObject result = new JSObject();
            result.put("events", rows);
            call.resolve(result);
        } catch (JSONException e) {
            call.reject("Bad ids: " + e.getMessage());
        } catch (Exception e) {
            call.reject("Failed to inspect events: " + e.getMessage());
        }
    }
}
