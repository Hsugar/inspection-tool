package com.jiantu.inspection;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** File-format and stream handling shared by the export bridge and its provider. */
final class ExportFiles {
    private ExportFiles() {}

    static boolean supportsMimeType(String mimeType) {
        return "text/csv".equals(mimeType)
            || "application/hl7-v2".equals(mimeType)
            || "application/fhir+json".equals(mimeType)
            || "application/fhir+xml".equals(mimeType)
            || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet".equals(mimeType);
    }

    static String fhirMimeType(String name) {
        if (name == null) return null;
        if ((name.startsWith("检图_fhir-json_") || name.startsWith("GenDX_T_fhir-json_")) && name.endsWith(".json")) return "application/fhir+json";
        if ((name.startsWith("检图_fhir-xml_") || name.startsWith("GenDX_T_fhir-xml_")) && name.endsWith(".xml")) return "application/fhir+xml";
        if (name.startsWith("GenDX_T_hl7-v2_") && name.endsWith(".hl7")) return "application/hl7-v2";
        return null;
    }

    interface Destination {
        OutputStream open() throws IOException;
    }

    /** Return only after both streams close; a provider can report failure on close. */
    static void copyAndClose(InputStream source, Destination destination) throws IOException {
        try (InputStream in = source; OutputStream out = destination.open()) {
            if (out == null) throw new IOException("无法写入所选位置");
            byte[] buffer = new byte[8192];
            int count;
            while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
            out.flush();
        }
    }
}
