package com.jiantu.inspection;

import java.io.IOException;
import java.text.ParsePosition;
import java.text.SimpleDateFormat;
import java.util.*;

/** Keeps captured evidence immutable after the one permitted confirmation. */
final class RecordWritePolicy {
    private RecordWritePolicy() {}

    static final String READ_ONLY = "检测记录已保存，只能查看和导出，不能修改或删除";

    static void validate(String id, Map<String, Object> previous, Map<String, Object> next, boolean active) throws IOException {
        if (!id.equals(next.get("id"))) throw new IOException("记录 ID 与内容不一致");
        if (previous == null) {
            if (!"queued".equals(next.get("phase")) || !Boolean.FALSE.equals(next.get("reviewed"))
                || next.containsKey("lockedAt") || next.containsKey("confirmedAt"))
                throw new IOException("新检测必须从录入和拍照流程开始");
            validatePatient(next.get("patient"));
            return;
        }
        if (!active || previous.containsKey("lockedAt")) throw new IOException(READ_ONLY);
        for (String key : Arrays.asList("id", "patient", "name", "createdAt", "createdTimestamp", "image")) {
            if (!Objects.equals(previous.get(key), next.get(key)))
                throw new IOException("患者信息与原始照片已固定，请重新录入开始新检测");
        }
        String phase = string(previous.get("phase"));
        String nextPhase = string(next.get("phase"));
        if ("queued".equals(phase) || "reading".equals(phase)) {
            if (!Arrays.asList("queued", "reading", "done", "error").contains(nextPhase)
                || ("reading".equals(phase) && "queued".equals(nextPhase))
                || !Boolean.FALSE.equals(next.get("reviewed"))
                || next.containsKey("lockedAt") || next.containsKey("confirmedAt"))
                throw new IOException("检测处理状态不可回退或提前确认");
            return;
        }
        if (!"done".equals(phase) && !"error".equals(phase)) throw new IOException(READ_ONLY);
        String lockedAt = string(next.get("lockedAt"));
        if (!validTimestamp(lockedAt) || !lockedAt.equals(next.get("confirmedAt")))
            throw new IOException("确认保存时间无效");
        Map<String, Object> expected = new HashMap<>(previous);
        expected.put("lockedAt", lockedAt);
        expected.put("confirmedAt", lockedAt);
        expected.put("reviewed", confirmedResult(previous));
        if (!expected.equals(next)) throw new IOException("确认保存不能修改照片、患者信息或识别结果");
    }

    private static void validatePatient(Object value) throws IOException {
        if (!(value instanceof Map)) throw new IOException("请先填写完整患者信息");
        Map<?, ?> patient = (Map<?, ?>) value;
        for (String field : Arrays.asList("name", "patientId", "contact")) {
            if (string(patient.get(field)).trim().isEmpty()) throw new IOException("请先填写完整患者信息");
        }
        String age = string(patient.get("age")).trim();
        if (!age.matches("[0-9]{1,3}") || Integer.parseInt(age) > 150
            || !Arrays.asList("male", "female", "other").contains(patient.get("gender"))
            || !Arrays.asList("MTB", "GBS", "Flu A", "Flu B", "NG", "MG", "CT").contains(patient.get("testItem")))
            throw new IOException("请先填写有效的患者信息");
    }

    private static boolean validTimestamp(String value) {
        if (!value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z")) return false;
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.ROOT);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        format.setLenient(false);
        ParsePosition position = new ParsePosition(0);
        return format.parse(value, position) != null && position.getIndex() == value.length();
    }

    private static String string(Object value) { return value instanceof String ? (String) value : ""; }

    /** Power is deliberately excluded from the result and confirmation decision. */
    private static boolean confirmedResult(Map<String, Object> record) {
        if (!"done".equals(record.get("phase")) || string(record.get("barcode")).isEmpty()) return false;
        if (!(record.get("device") instanceof Map)) return false;
        Map<?, ?> device = (Map<?, ?>) record.get("device");
        if (device.get("body") == null || !(device.get("lamps") instanceof List)) return false;
        Set<String> keys = new HashSet<>(Arrays.asList("negative", "positive", "invalid"));
        Set<String> found = new HashSet<>();
        int on = 0;
        for (Object value : (List<?>) device.get("lamps")) {
            if (!(value instanceof Map)) continue;
            Map<?, ?> lamp = (Map<?, ?>) value;
            String key = string(lamp.get("key"));
            if (!keys.contains(key)) continue;
            if (!found.add(key)) return false;
            if ("on".equals(lamp.get("state"))) on++;
            else if (!"off".equals(lamp.get("state"))) return false;
        }
        return found.size() == 3 && on == 1;
    }
}
