package com.jiantu.inspection;

import android.net.Uri;
import androidx.core.content.FileProvider;
import java.util.List;

/** Keep the FHIR/HL7 media type when recipients query an exported file's content URI. */
public class InspectionFileProvider extends FileProvider {
    @Override public String getType(Uri uri) {
        // Let FileProvider validate and resolve the configured root first.
        String fallback = super.getType(uri);
        List<String> segments = uri.getPathSegments();
        if (segments.size() == 2 && "inspection_exports".equals(segments.get(0))) {
            String fhir = ExportFiles.fhirMimeType(segments.get(1));
            if (fhir != null) return fhir;
        }
        return fallback;
    }
}
