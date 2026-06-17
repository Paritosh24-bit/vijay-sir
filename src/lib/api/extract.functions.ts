import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const FIELDS = [
  "NAME","BIRTH_DT","Gender","Marital Status","DESIG","JOIN_DT","PRB_DT","CONF_DT",
  "DEPT_NAME","Lab Details","EPAN_NO","EMAILID","Address 1","Address2","Pin 1","Pin 2",
  "ADHAR_NO","PF_UAN","ESI Number","EMP_Mobile Number","Alternate_Mobile Number",
  "Father Name","Father DOB","Mother Name","Mother DOB","Spouse_Name","Spouse DOB",
  "Child_1","Child_1 DOB","Child_2","Child_2 DOB","Qualification",
  "Previous Employement","Present Employement","Reference Name",
] as const;

export type ExtractedRecord = Record<(typeof FIELDS)[number], string>;

export const extractFromPdf = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      fileName: z.string(),
      fileBase64: z.string().min(10),
    }),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const systemPrompt = `You are a data-extraction engine for KF Bioplants HR. You receive a scanned employee personal data form (PDF). Extract values as plain strings. Use empty string when not present. Dates must be DD/MM/YYYY when possible. Combine multi-line address fields with commas. For Qualification, summarize the highest as "Degree, Specialization, Institute, Year". For Previous/Present Employment, summarize as "Company - Designation (From-To)". Return ONLY a JSON object matching the schema, no commentary.`;

    const schemaProps: Record<string, { type: "string"; description?: string }> = {};
    for (const f of FIELDS) schemaProps[f] = { type: "string" };

    const body = {
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Extract employee details from this form." },
            {
              type: "file",
              file: {
                filename: data.fileName,
                file_data: `data:application/pdf;base64,${data.fileBase64}`,
              },
            },
          ],
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "submit_employee",
            description: "Submit extracted employee data",
            parameters: {
              type: "object",
              properties: schemaProps,
              required: [...FIELDS],
              additionalProperties: false,
            },
          },
        },
      ],
      tool_choice: { type: "function", function: { name: "submit_employee" } },
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text();
      if (res.status === 429) throw new Error("Rate limit reached. Please try again shortly.");
      if (res.status === 402) throw new Error("AI credits exhausted. Please add credits in Workspace settings.");
      throw new Error(`AI gateway error ${res.status}: ${txt.slice(0, 300)}`);
    }
    const json = await res.json();
    const call = json?.choices?.[0]?.message?.tool_calls?.[0];
    const argsStr = call?.function?.arguments;
    if (!argsStr) throw new Error("AI did not return structured data");
    const parsed = JSON.parse(argsStr) as Record<string, unknown>;
    const record: ExtractedRecord = {} as ExtractedRecord;
    for (const f of FIELDS) record[f] = String(parsed[f] ?? "");
    return { record };
  });