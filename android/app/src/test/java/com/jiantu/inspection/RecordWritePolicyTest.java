package com.jiantu.inspection;

import static org.junit.Assert.*;
import java.io.IOException;
import java.util.*;
import org.junit.Test;

public class RecordWritePolicyTest {
    private static Map<String, Object> map(Object... pairs) {
        Map<String, Object> result = new HashMap<>();
        for (int index = 0; index < pairs.length; index += 2) result.put((String) pairs[index], pairs[index + 1]);
        return result;
    }
    private Map<String, Object> queued() {
        return map("id", "capture-1", "name", "camera.jpg", "image", "", "phase", "queued", "reviewed", false,
            "createdAt", "2026/10/13 12:00", "createdTimestamp", 1791864000000L,
            "patient", map("name", "患者", "gender", "female", "age", "42", "patientId", "P001", "contact", "123", "testItem", "MTB"));
    }
    private Map<String, Object> completed() {
        Map<String, Object> record = queued();
        record.put("phase", "done");
        record.put("barcode", "001234");
        record.put("device", map("body", map("x", 0), "lamps", Arrays.asList(
            map("key", "negative", "state", "on"), map("key", "positive", "state", "off"), map("key", "invalid", "state", "off"))));
        return record;
    }
    private Map<String, Object> confirmed(Map<String, Object> previous, boolean reviewed) {
        Map<String, Object> next = new HashMap<>(previous);
        next.put("lockedAt", "2026-10-13T04:00:00.000Z");
        next.put("confirmedAt", "2026-10-13T04:00:00.000Z");
        next.put("reviewed", reviewed);
        return next;
    }
    private void accept(Map<String, Object> previous, Map<String, Object> next, boolean active) throws Exception {
        RecordWritePolicy.validate("capture-1", previous, next, active);
    }
    private void reject(Map<String, Object> previous, Map<String, Object> next, boolean active) {
        assertThrows(IOException.class, () -> accept(previous, next, active));
    }

    @Test public void newRecordsRequirePatientAndQueuedPhase() throws Exception {
        Map<String, Object> next = queued();
        accept(null, next, false);
        next.remove("patient"); reject(null, next, false);
        reject(null, completed(), false);
        next = queued(); next.put("id", "other"); reject(null, next, false);
    }

    @Test public void oldRecordsRemainReadOnlyEvenWithoutLockTimestamp() {
        reject(completed(), confirmed(completed(), true), false);
        reject(queued(), completed(), false);
    }

    @Test public void analysisAdvancesWithoutChangingPatientOrSource() throws Exception {
        Map<String, Object> initial = queued();
        Map<String, Object> reading = new HashMap<>(initial); reading.put("phase", "reading");
        accept(initial, reading, true);
        accept(reading, completed(), true);
        reject(reading, initial, true);
        Map<String, Object> changed = completed(); changed.put("name", "other.jpg"); reject(reading, changed, true);
        changed = completed(); changed.put("patient", map("name", "另一患者")); reject(reading, changed, true);
        changed = completed(); changed.put("reviewed", true); reject(reading, changed, true);
    }

    @Test public void resultsCanOnlyReceiveOneConfirmation() throws Exception {
        Map<String, Object> previous = completed();
        Map<String, Object> next = confirmed(previous, true);
        accept(previous, next, true);
        reject(next, next, true);
        Map<String, Object> altered = confirmed(previous, true); altered.put("barcode", "567890"); reject(previous, altered, true);
        reject(previous, previous, true);
        reject(previous, confirmed(previous, false), true);
    }

    @Test public void powerIsNeverNeededToConfirmAResult() throws Exception {
        for (String state : Arrays.asList("on", "off", "unknown")) {
            Map<String, Object> previous = completed();
            Map<String, Object> device = (Map<String, Object>) previous.get("device");
            List<Object> lamps = new ArrayList<>((List<?>) device.get("lamps"));
            lamps.add(map("key", "power", "state", state)); device.put("lamps", lamps);
            accept(previous, confirmed(previous, true), true);
        }
        accept(completed(), confirmed(completed(), true), true);
    }

    @Test public void uncertainConflictingOrFailedCapturesRemainUnreviewed() throws Exception {
        Map<String, Object> previous = completed();
        previous.put("device", map("body", map("x", 0), "lamps", Arrays.asList(
            map("key", "negative", "state", "on"), map("key", "positive", "state", "on"), map("key", "invalid", "state", "off"))));
        accept(previous, confirmed(previous, false), true);
        reject(previous, confirmed(previous, true), true);
        previous = completed(); previous.put("barcode", ""); accept(previous, confirmed(previous, false), true);
        previous = completed(); previous.put("phase", "error"); accept(previous, confirmed(previous, false), true);
    }

    @Test public void confirmationRequiresOneValidTimestamp() {
        Map<String, Object> previous = completed();
        Map<String, Object> next = confirmed(previous, true); next.put("confirmedAt", "2026-10-13T04:01:00.000Z");
        reject(previous, next, true);
        next.put("lockedAt", "2026-02-31T04:00:00.000Z"); next.put("confirmedAt", next.get("lockedAt"));
        reject(previous, next, true);
    }
}
