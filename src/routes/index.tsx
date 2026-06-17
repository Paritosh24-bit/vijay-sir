import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import * as XLSX from "xlsx";
import { toast, Toaster } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { extractFromPdf, FIELDS, type ExtractedRecord } from "@/lib/api/extract.functions";
import logo from "@/assets/kf-logo.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "KF Bioplants — Employee Form Extractor" },
      { name: "description", content: "Upload scanned employee personal data forms and instantly extract structured details into the master Excel format." },
      { property: "og:title", content: "KF Bioplants — Employee Form Extractor" },
      { property: "og:description", content: "Upload scanned employee personal data forms and instantly extract structured details into the master Excel format." },
    ],
  }),
  component: Index,
});

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function Index() {
  const extract = useServerFn(extractFromPdf);
  const [loading, setLoading] = useState(false);
  const [record, setRecord] = useState<ExtractedRecord | null>(null);
  const [fileName, setFileName] = useState<string>("");

  const handleFile = async (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Please upload a PDF file");
      return;
    }
    setLoading(true);
    setRecord(null);
    try {
      const fileBase64 = await fileToBase64(file);
      const { record } = await extract({ data: { fileName: file.name, fileBase64 } });
      setRecord(record);
      setFileName(file.name.replace(/\.pdf$/i, ""));
      toast.success("Extraction complete");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Extraction failed");
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setRecord((r) => (r ? { ...r, [field]: value } as ExtractedRecord : r));
  };

  const downloadExcel = () => {
    if (!record) return;
    // Build row matching the master format header order (split *_DOB back into "DOB" cols)
    const masterHeaderRow1 = [
      "","","","","","","","","","","","","","","","","","","","","",
      "Family Details","","","","","","","","","",
      "Employement Details","","",
    ];
    const masterHeaderRow2 = [
      "NAME","BIRTH_DT","Gender","Marital Status","DESIG","JOIN_DT","PRB_DT","CONF_DT",
      "DEPT_NAME","Lab Details","EPAN_NO","EMAILID","Address 1","Address2","Pin 1","Pin 2",
      "ADHAR_NO","PF_UAN","ESI Number","EMP_Mobile Number","Alternate_Mobile Number",
      "Father Name","DOB","Mother Name","DOB","Spouse_Name","DOB","Child_1","DOB","Child_2","DOB",
      "Qualification","Previous  Employement","Present Employement","Reference Name",
    ];
    const dataRow = FIELDS.map((f) => record[f]);
    const aoa = [masterHeaderRow1, masterHeaderRow2, dataRow];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `${fileName || "employee"}_extracted.xlsx`);
  };

  const groups: { title: string; fields: string[] }[] = [
    { title: "Personal", fields: ["NAME","BIRTH_DT","Gender","Marital Status","EMAILID","EMP_Mobile Number","Alternate_Mobile Number"] },
    { title: "Employment", fields: ["DESIG","DEPT_NAME","JOIN_DT","PRB_DT","CONF_DT","Lab Details"] },
    { title: "Identification", fields: ["EPAN_NO","ADHAR_NO","PF_UAN","ESI Number"] },
    { title: "Address", fields: ["Address 1","Pin 1","Address2","Pin 2"] },
    { title: "Family", fields: ["Father Name","Father DOB","Mother Name","Mother DOB","Spouse_Name","Spouse DOB","Child_1","Child_1 DOB","Child_2","Child_2 DOB"] },
    { title: "Background", fields: ["Qualification","Previous Employement","Present Employement","Reference Name"] },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="top-right" />
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <img src={logo.url} alt="KF Bioplants" className="h-12 w-auto" />
            <div>
              <h1 className="text-lg font-semibold leading-tight">Employee Form Extractor</h1>
              <p className="text-xs text-muted-foreground">Scanned PDF → Master Excel format</p>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 space-y-6">
        <Card className="p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">Upload scanned Personal Data Form</h2>
              <p className="text-sm text-muted-foreground">PDF only. Extraction runs through AI and may take 10–30 seconds.</p>
            </div>
            <Input
              type="file"
              accept="application/pdf"
              disabled={loading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              className="max-w-sm"
            />
          </div>
          {loading && (
            <p className="mt-4 text-sm text-muted-foreground">Extracting fields from the form…</p>
          )}
        </Card>

        {record && (
          <Card className="p-6 space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">Extracted Details</h2>
              <Button onClick={downloadExcel}>Download Excel</Button>
            </div>
            {groups.map((g) => (
              <section key={g.title} className="space-y-3">
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{g.title}</h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {g.fields.map((f) => (
                    <label key={f} className="flex flex-col gap-1 text-sm">
                      <span className="text-xs font-medium text-muted-foreground">{f}</span>
                      <Input
                        value={(record as Record<string, string>)[f] ?? ""}
                        onChange={(e) => updateField(f, e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </Card>
        )}
      </main>
    </div>
  );
}
