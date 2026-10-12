package com.jiantu.inspection;

import static org.junit.Assert.*;
import java.io.*;
import org.junit.Test;

public class ExportFilesTest {
    private static class Source extends ByteArrayInputStream {
        boolean closed;
        Source(byte[] bytes) { super(bytes); }
        @Override public void close() throws IOException { closed = true; super.close(); }
    }
    private static class Destination extends ByteArrayOutputStream {
        boolean closed;
        boolean failOnClose;
        @Override public void close() throws IOException {
            closed = true;
            if (failOnClose) throw new IOException("provider close failed");
            super.close();
        }
    }

    @Test public void copyPreservesBytesAndClosesBeforeReturning() throws Exception {
        byte[] bytes = new byte[20001];
        for (int i = 0; i < bytes.length; i++) bytes[i] = (byte) i;
        Source source = new Source(bytes);
        Destination destination = new Destination();
        ExportFiles.copyAndClose(source, () -> destination);
        assertArrayEquals(bytes, destination.toByteArray());
        assertTrue(source.closed);
        assertTrue(destination.closed);
    }

    @Test public void providerFailureOnCloseMustNotReportSuccess() throws Exception {
        Source source = new Source(new byte[]{1, 2, 3});
        Destination destination = new Destination();
        destination.failOnClose = true;
        IOException error = assertThrows(IOException.class, () -> ExportFiles.copyAndClose(source, () -> destination));
        assertEquals("provider close failed", error.getMessage());
        assertTrue(source.closed);
        assertTrue(destination.closed);
    }

    @Test public void failedDestinationOpenStillClosesTheSource() throws Exception {
        Source source = new Source(new byte[]{1});
        assertThrows(IOException.class, () -> ExportFiles.copyAndClose(source, () -> { throw new IOException("disconnected"); }));
        assertTrue(source.closed);
    }

    @Test public void missingDestinationStillClosesTheSource() throws Exception {
        Source source = new Source(new byte[]{1});
        assertThrows(IOException.class, () -> ExportFiles.copyAndClose(source, () -> null));
        assertTrue(source.closed);
    }

    @Test public void fhirTypesAreSpecificToGeneratedExportNames() {
        assertEquals("application/fhir+json", ExportFiles.fhirMimeType("检图_fhir-json_20261010_12345678.json"));
        assertEquals("application/fhir+xml", ExportFiles.fhirMimeType("检图_fhir-xml_20261010_12345678.xml"));
        assertNull(ExportFiles.fhirMimeType("record.json"));
        assertNull(ExportFiles.fhirMimeType("record.xml"));
        assertNull(ExportFiles.fhirMimeType("检图_fhir-json_20261010_12345678.xlsx"));
        assertNull(ExportFiles.fhirMimeType(null));
        assertTrue(ExportFiles.supportsMimeType("text/csv"));
        assertTrue(ExportFiles.supportsMimeType("application/fhir+xml"));
        assertTrue(ExportFiles.supportsMimeType("application/fhir+json"));
        assertTrue(ExportFiles.supportsMimeType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"));
        assertFalse(ExportFiles.supportsMimeType("application/json"));
        assertFalse(ExportFiles.supportsMimeType("*/*"));
        assertFalse(ExportFiles.supportsMimeType(null));
    }
}
