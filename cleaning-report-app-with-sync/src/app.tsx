import React, { useEffect, useState, useRef } from "react";

function canShareFile(file: File) {
  // Web Share Level 2 (with files) support check
  // Must be in a user gesture context when called
  // @ts-ignore
  if (navigator && 'canShare' in navigator && typeof (navigator as any).canShare === 'function') {
    try { return (navigator as any).canShare({ files: [file] }); } catch { return false; }
  }
  return false;
}

import { motion } from "framer-motion";
import {
  Upload, Plus, Trash2, FileText, Building2, Image as ImageIcon, LogIn,
  Download, FolderOpen, LogOut, Save, Settings2, ChevronDown, Mail
} from "lucide-react";
import { jsPDF } from "jspdf";

// ========================= Email config =========================
// Option A: Web Share (abre o app de e‑mail/compartilhamento com o PDF ANEXADO)
// — funciona em iOS/Android e alguns desktops modernos (Web Share Level 2).
// Option B: SMTPJS (https://smtpjs.com/) — inclua no index.html:
// <script src="https://smtpjs.com/v3/smtp.js"></script>
// Preencha se usar o método SecureToken do SMTPJS
const SMTP_SECURE_TOKEN = ""; // ex.: "ab123..." do smtpjs.com
const SMTP_FROM = "";        // remetente (deve bater com o token)

// Option C (avançado): endpoint próprio que recebe {to, subject, body, filename, base64}
const CUSTOM_EMAIL_ENDPOINT = "/api/send-email";

// ====== Sync (cross-device) using Vercel KV ======
const SYNC_ENDPOINT_PULL = "/api/sync/pull";
const SYNC_ENDPOINT_PUSH = "/api/sync/push";

function randomId() {
  try { return crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
}

async function pullAll(workspace: string) {
  const res = await fetch(`${SYNC_ENDPOINT_PULL}?workspace=${encodeURIComponent(workspace)}`).catch(()=>null as any);
  if (!res || !res.ok) return null;
  return await res.json().catch(()=>null);
}

async function pushAll(workspace: string, payload: any) {
  await fetch(SYNC_ENDPOINT_PUSH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workspace, payload })
  }).catch(()=>{});
}
 // ex.: "/api/send-email" (vazio se não usar)

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// Tenta (1) Web Share com anexo, (2) backend/SMTP com anexo, (3) download como último recurso.
async function sendEmailWithPdf({ subject, body, filename, blob }:{ subject:string; body:string; filename:string; blob:Blob }) {
  // (1) Web Share API com arquivo — abre o app do e‑mail/compartilhamento e ANEXA o PDF
  try {
    const file = new File([blob], filename, { type: "application/pdf" });
    const navAny: any = navigator as any;
    if (navAny && typeof navAny.share === "function" && (!navAny.canShare || navAny.canShare({ files: [file] }))) {
      await navAny.share({ files: [file], title: subject, text: body });
      return true;
    }
  } catch (e) {
    // continua para os próximos métodos
  }

  // (2) Backend próprio (anexo real)
  if (CUSTOM_EMAIL_ENDPOINT) {
    const to = prompt("Enviar para qual e-mail?", "");
    if (!to) return false;
    const base64 = await blobToBase64(blob);
    const res = await fetch(CUSTOM_EMAIL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, subject, body, filename, base64 })
    }).catch(()=> null as any);
    if (res && res.ok) return true;
if (res) {
  const data = await res.json().catch(() => null);
  alert("Erro ao enviar pelo servidor: " + (data?.error || res.status + " " + res.statusText));
}
  }

  // (2b) SMTPJS (anexo real)
  const anyWin: any = window as any;
  if (SMTP_SECURE_TOKEN && anyWin.Email && typeof anyWin.Email.send === "function") {
    const to = prompt("Enviar para qual e-mail?", "");
    if (!to) return false;
    const base64 = await blobToBase64(blob);
    try {
      const result = await anyWin.Email.send({
        SecureToken: SMTP_SECURE_TOKEN,
        To: to,
        From: SMTP_FROM,
        Subject: subject,
        Body: body,
        Attachments: [{ name: filename, data: `base64,${base64}` }]
      });
      if (String(result).toLowerCase().includes("ok")) return true;
    } catch {}
  }

  // (3) Último recurso: baixar o PDF e orientar o usuário a anexar manualmente
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(()=> URL.revokeObjectURL(url), 60_000);
  alert("Não consegui abrir o app de e‑mail com o anexo automaticamente neste dispositivo/navegador. Baixei o PDF para você anexar manualmente.");
  return false;
}

// ========================= Utils  =========================
function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
function formatDateLongEnglish(isoDate: string) {
  if (!isoDate) return "";
  const d = new Date(isoDate + "T00:00:00");
  const month = d.toLocaleString("en-US", { month: "long" });
  const day = ordinal(d.getDate());
  const year = d.getFullYear();
  return `${month} ${day}, ${year}`;
}
const SUMMARY_TEMPLATE = (staffName: string, dateISO: string) => {
  const dateLong = formatDateLongEnglish(dateISO);
  const staff = staffName || "[Staff Name]";
  const dateTxt = dateLong || "[Date]";
  return `On ${dateTxt}, cleaning staff member ${staff} carried out cleaning tasks in the following areas using appropriate machinery and equipment. The work included floor cleaning and dust removal with the machine.`;
};

// ========================= Types =========================
type Area = { siteName: string; sections: string[] };
type Report = { id: number; date: string; staffName: string; summary: string; notes: string; areas: Area[]; photos: string[] };

type BankAccount = {
  id: string; bankName: string; accountName: string; sortCode: string; accountNumber: string; iban?: string; referenceNote?: string
};

type InvoiceItem = { description: string; amount: number };
type Invoice = {
  id: number; date: string; clientName: string; clientAddress: string; items: InvoiceItem[];
  paymentMethod: "cash" | "bank"; bankAccountId?: string; notes?: string;
};

// ========================= Helpers =========================
async function fileToJPEGDataURL(file: File): Promise<string> {
  if (/jpe?g$/i.test(file.name) || file.type === "image/jpeg") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  const bitmap = await createImageBitmap(file).catch(async () => {
    return new Promise<ImageBitmap>((resolve, reject) => {
      const img = new Image();
      img.onload = () => { // @ts-ignore
        resolve(createImageBitmap ? createImageBitmap(img) : (img as any));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  });
  const canvas = document.createElement("canvas");
  // @ts-ignore
  const w = (bitmap as any).width || (bitmap as any).naturalWidth;
  // @ts-ignore
  const h = (bitmap as any).height || (bitmap as any).naturalHeight;
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  // @ts-ignore
  ctx.drawImage(bitmap as any, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}

async function buildReportPDF(r: Report) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 48;
  let y = margin;

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.text("Cleaning Report", margin, y);
  y += 24;

  // Meta
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.text(`Date: ${formatDateLongEnglish(r.date)}`, margin, y); y += 18;
  doc.text(`Staff Name: ${r.staffName}`, margin, y); y += 24;

  // Summary
  doc.setFont("helvetica", "bold");
  doc.text("Summary of Work:", margin, y); y += 16;
  doc.setFont("helvetica", "normal");
  const summaryLines = doc.splitTextToSize(r.summary, pageWidth - margin * 2);
  doc.text(summaryLines, margin, y); y += summaryLines.length * 14 + 16;

  // Areas
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Area cleaned:", margin, y); y += 18;

  doc.setFontSize(12);
  r.areas.forEach((a, idx) => {
    const areaTitle = (a.siteName || `Area ${idx + 1}`).trim();
    doc.setFont("helvetica", "bold");
    const titleLines = doc.splitTextToSize(areaTitle, pageWidth - margin * 2);
    doc.text(titleLines, margin, y);
    y += titleLines.length * 14 + 6;

    doc.setFont("helvetica", "normal");
    const cleaned = (a.sections || []).map(s => s.trim()).filter(Boolean);
    cleaned.forEach(sec => {
      const line = `* ${sec}`;
      const lines = doc.splitTextToSize(line, pageWidth - margin * 2 - 12);
      doc.text(lines, margin + 12, y);
      y += lines.length * 14 + 4;
    });

    if (y > pageHeight - margin - 100) { doc.addPage(); y = margin; }
  });

  // Notes
  if (r.notes && r.notes.trim()) {
    if (y > pageHeight - margin - 120) { doc.addPage(); y = margin; }
    doc.setFont("helvetica", "bold");
    doc.text("Additional Notes:", margin, y); y += 16;
    doc.setFont("helvetica", "normal");
    const noteLines = doc.splitTextToSize(r.notes, pageWidth - margin * 2);
    doc.text(noteLines, margin, y); y += noteLines.length * 14 + 12;
  }

  // Photos grid — max 2 pages, 3 columns
  const photosArr = (r.photos as any[] || []).filter((p:any) => typeof p === "string");
  if (photosArr.length) {
    const maxPages = 2, colCount = 3, gap = 8, titleH = 16;
    const usableW = pageWidth - margin * 2;
    const usableH = pageHeight - margin * 2 - titleH;
    const cellW = Math.floor((usableW - gap * (colCount - 1)) / colCount);

    const total = photosArr.length;
    const rowsNeeded = Math.max(1, Math.ceil(total / (colCount * maxPages)));
    const cellH = Math.max(50, Math.floor((usableH - gap * (rowsNeeded - 1)) / rowsNeeded));
    let placed = 0;
    const pagesToUse = Math.min(maxPages, Math.ceil(total / (colCount * rowsNeeded)));

    for (let page = 0; page < pagesToUse; page++) {
      doc.addPage();
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Photos", margin, margin);

      const perPage = colCount * rowsNeeded;
      for (let j = 0; j < perPage && placed < total; j++) {
        const dataUrl = photosArr[placed++];
        const row = Math.floor(j / colCount);
        const col = j % colCount;
        const x = margin + col * (cellW + gap);
        const yCell = margin + titleH + row * (cellH + gap);

        const img = new Image();
        img.src = dataUrl;
        await new Promise((res) => { img.onload = res; });
        const scale = Math.min(cellW / (img.width || 1), cellH / (img.height || 1));
        const w = (img.width || 1) * scale;
        const h = (img.height || 1) * scale;
        const xCentered = x + (cellW - w) / 2;
        const yCentered = yCell + (cellH - h) / 2;

        doc.setDrawColor(230, 230, 230);
        doc.rect(x, yCell, cellW, cellH);
        doc.addImage(dataUrl, "JPEG", xCentered, yCentered, w, h, undefined, "FAST");
      }
    }
  }

  return doc;
}

// ========================= Component =========================
export default function CleaningReportApp() {
  // Auth
  const [isAuthed, setIsAuthed] = useState<boolean>(() => { try { return localStorage.getItem("auth_isAuthed_v1") === "1"; } catch { return false; } });
  const [auth, setAuth] = useState({ email: "", password: "" });

  // Currency helper
  const GBP = (n:number) => new Intl.NumberFormat("en-GB", { style:"currency", currency:"GBP" }).format(n);

  // Bank accounts (UK)
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(() => {
    try { const raw = localStorage.getItem("bank_accounts_v1"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("bank_accounts_v1", JSON.stringify(bankAccounts)); } catch {} }, [bankAccounts]);

  // Presets (areas/sections)
  const [presets, setPresets] = useState<Area[]>(() => {
    try { const raw = localStorage.getItem("cleaning_presets_v1"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("cleaning_presets_v1", JSON.stringify(presets)); } catch {} }, [presets]);

  // Cleaning report fields
  const [date, setDate] = useState<string>("");
  const [staffName, setStaffName] = useState<string>("");
  const [summary, setSummary] = useState<string>("");
  const [isSummaryTouched, setIsSummaryTouched] = useState(false);
  const [notes, setNotes] = useState<string>("");
  const [areas, setAreas] = useState<Area[]>([{ siteName: "", sections: [""] }]);
  const [photos, setPhotos] = useState<File[]>([]);

  // Reports & Invoices storage
  
  // Workspace ID (shared across devices). Copy this code to outro dispositivo para sincronizar.
  const [workspaceId] = useState<string>(() => {
    try {
      const k = localStorage.getItem("cleaning_workspace_v1");
      if (k) return k;
      const nw = randomId();
      localStorage.setItem("cleaning_workspace_v1", nw);
      return nw;
    } catch { return "local-" + randomId(); }
  });
const [reports, setReports] = useState<Report[]>(() => {
    try { const raw = localStorage.getItem("cleaning_reports_v1"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("cleaning_reports_v1", JSON.stringify(reports)); } catch {} }, [reports]);

  const [invoices, setInvoices] = useState<Invoice[]>(() => {
    try { const raw = localStorage.getItem("cleaning_invoices_v1"); return raw ? JSON.parse(raw) : []; } catch { return []; }
  });
  useEffect(() => { try { localStorage.setItem("cleaning_invoices_v1", JSON.stringify(invoices)); } catch {} }, [invoices]);

  // Navigation
  const [view, setView] = useState<"dashboard" | "form" | "reports" | "invoices" | "admin">("dashboard");
  const [reportsTab, setReportsTab] = useState<"jobs" | "invoices">("jobs");
  const [targetAreaIdx, setTargetAreaIdx] = useState<number>(0);
  const [sendingId, setSendingId] = useState<number | null>(null);

  // Summary auto-fill
  useEffect(() => { if (!isSummaryTouched) setSummary(SUMMARY_TEMPLATE(staffName, date)); }, [staffName, date, isSummaryTouched]);
  useEffect(() => { if (targetAreaIdx >= areas.length) setTargetAreaIdx(Math.max(0, areas.length - 1)); }, [areas, targetAreaIdx]);

  // ==== Area helpers ====
  const addArea = () => setAreas((a) => [...a, { siteName: "", sections: [""] }]);
  const removeArea = (index: number) => setAreas((a) => a.filter((_, i) => i !== index));
  const updateAreaName = (index: number, value: string) => setAreas((a) => a.map((item, i) => (i === index ? { ...item, siteName: value } : item)));
  const updateSection = (areaIdx: number, secIdx: number, value: string) => setAreas((a) => a.map((item, i) => {
    if (i !== areaIdx) return item;
    const sections = item.sections.slice();
    sections[secIdx] = value;
    return { ...item, sections };
  }));
  const addSection = (areaIdx: number) => setAreas((a) => a.map((item, i) => i === areaIdx ? { ...item, sections: [...item.sections, ""] } : item));
  const removeSection = (areaIdx: number, secIdx: number) => setAreas((a) => a.map((item, i) => {
    if (i !== areaIdx) return item;
    const sections = item.sections.filter((_, s) => s !== secIdx);
    return { ...item, sections: sections.length ? sections : [""] };
  }));

  // Preset insertion
  const insertAreaFromPreset = (p: Area) => setAreas(a => [...a, { siteName: p.siteName, sections: [""] }]);
  const insertSectionFromPreset = (section: string) => setAreas(a => a.map((item, i) => (i === targetAreaIdx ? { ...item, sections: [...item.sections, section].filter(Boolean) } : item)));

  // ==== Auth ====
  const handleAuthSubmit: React.FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    const user = (auth.email || "").trim();
    const pass = (auth.password || "").trim();
    if (user === "admin" && pass === "866457") {
      setIsAuthed(true);
      try { localStorage.setItem("auth_isAuthed_v1", "1"); } catch {}
      setView("dashboard");
    } else {
      alert("Invalid credentials.");
    }
  };
  const logout = () => { setIsAuthed(false); try { localStorage.removeItem("auth_isAuthed_v1"); } catch {}; setAuth({ email: "", password: "" }); setView("dashboard"); };

  // ========================= Envio por e‑mail/compartilhamento (sem link!) =========================
  async function emailPdfBlob(pdf: jsPDF, filename: string, subject: string, body: string) {
    const blob = pdf.output("blob");
    // Tenta Web Share (anexa), depois backend/SMTP (anexa), sem usar link.
    return await sendEmailWithPdf({ subject, body, filename, blob });
  }

  
  // Debounced push to server when data changes
  const pushTimer = useRef<number | null>(null);
  const schedulePush = () => {
    if (pushTimer.current) window.clearTimeout(pushTimer.current);
    // prepare payload
    const payload = { reports, invoices, presets, bankAccounts, updatedAt: Date.now() };
    pushTimer.current = window.setTimeout(() => { pushAll(workspaceId, payload); }, 800);
  };
  useEffect(() => { schedulePush(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [reports, invoices, presets, bankAccounts]);

  // Initial pull from server (KV)
  useEffect(() => {
    (async () => {
      const data = await pullAll(workspaceId);
      if (data && (Array.isArray(data.reports) || Array.isArray(data.invoices))) {
        try {
          if (Array.isArray(data.reports)) { setReports(data.reports); localStorage.setItem("cleaning_reports_v1", JSON.stringify(data.reports)); }
          if (Array.isArray(data.invoices)) { setInvoices(data.invoices); localStorage.setItem("cleaning_invoices_v1", JSON.stringify(data.invoices)); }
          if (Array.isArray((data as any).presets)) { setPresets((data as any).presets); localStorage.setItem("cleaning_presets_v1", JSON.stringify((data as any).presets)); }
          if (Array.isArray((data as any).bankAccounts)) { setBankAccounts((data as any).bankAccounts); localStorage.setItem("bank_accounts_v1", JSON.stringify((data as any).bankAccounts)); }
        } catch {}
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);
// ========================= Report actions =========================
  const deleteReport = (reportId: number) => setReports(prev => { const next = prev.filter(r => r.id !== reportId); try { localStorage.setItem("cleaning_reports_v1", JSON.stringify(next)); } catch {}; return next; });
  const downloadReportPDF = async (reportId: number) => {
    const r = reports.find((x) => x.id === reportId);
    if (!r) return;
    const pdf = await buildReportPDF(r);
    const filename = `Cleaning_Report_${r.staffName}_${r.date}.pdf`;
    try { pdf.save(filename); }
    catch {
      const blobUrl = String(pdf.output("bloburl"));
      const a = document.createElement("a"); a.href = blobUrl; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    }
  };
  const emailReportPDF = async (reportId: number) => {
    const r = reports.find((x) => x.id === reportId);
    if (!r) return; setSendingId(reportId);
    try {
      const pdf = await buildReportPDF(r);
      const filename = `Cleaning_Report_${r.staffName}_${r.date}.pdf`;
      const subject = `Cleaning report — ${formatDateLongEnglish(r.date)} — ${r.staffName}`;
      const body = `Segue em anexo o relatório de limpeza de ${formatDateLongEnglish(r.date)}, realizado por ${r.staffName}.`;
      await emailPdfBlob(pdf, filename, subject, body);
    } finally { setSendingId(null); }
  };

  // ========================= Invoices helpers =========================
  const invoiceTotal = (items: InvoiceItem[]) => items.reduce((s, it) => s + (Number(it.amount)||0), 0);
  function getBankById(id?: string) { return bankAccounts.find(b=> b.id===id); }

  async function buildInvoicePDF(inv: Invoice) {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 48; let y = margin;

    // Header
    doc.setFont("helvetica","bold"); doc.setFontSize(22);
    doc.text("INVOICE", margin, y); y += 10; doc.setFontSize(11);
    doc.setFont("helvetica","normal");
    doc.text(`Date: ${formatDateLongEnglish(inv.date)}`, margin, y+=18);
    doc.text(`Invoice #: ${inv.id}`, margin, y+=16);

    // Client box
    y += 12; doc.setFont("helvetica","bold"); doc.text("Bill To:", margin, y); y += 14; doc.setFont("helvetica","normal");
    const clientLines = doc.splitTextToSize(`${inv.clientName}\n${inv.clientAddress}`, 260);
    doc.text(clientLines, margin, y);

    // Items table header
    y += clientLines.length*14 + 18; doc.setFont("helvetica","bold");
    doc.text("Description", margin, y); doc.text("Amount (GBP)", pageWidth - margin - 120, y, { align: "left" });
    y += 8; doc.setDrawColor(200); doc.line(margin, y, pageWidth - margin, y); y += 14; doc.setFont("helvetica","normal");

    inv.items.forEach((it) => {
      const descLines: string[] = doc.splitTextToSize(it.description || "-", pageWidth - margin*2 - 140);
      descLines.forEach((ln: string, i: number) => {
        doc.text(ln, margin, y);
        if (i===0) doc.text(GBP(Number(it.amount)||0), pageWidth - margin - 120, y);
        y += 14;
      });
      y += 4;
    });

    // Total
    y += 8; doc.setDrawColor(200); doc.line(margin, y, pageWidth - margin, y); y += 16; doc.setFont("helvetica","bold");
    const totalTxt = `Total: ${GBP(invoiceTotal(inv.items))}`;
    doc.text(totalTxt, pageWidth - margin - doc.getTextWidth(totalTxt), y);

    // Payment method
    y += 28; doc.setFont("helvetica","bold"); doc.text("Payment Method:", margin, y); y += 14; doc.setFont("helvetica","normal");
    if (inv.paymentMethod === "cash") {
      doc.text("Cash (GBP)", margin, y);
    } else {
      const bank = getBankById(inv.bankAccountId);
      const bankLines = bank ? [
        `${bank.bankName} — ${bank.accountName}`,
        `Sort Code: ${bank.sortCode}`,
        `Account Number: ${bank.accountNumber}`,
        bank.iban ? `IBAN: ${bank.iban}` : "",
        bank.referenceNote ? `Reference: ${bank.referenceNote}` : "",
      ].filter(Boolean) : ["Bank details not found."];
      doc.text(bankLines as string[], margin, y);
    }

    if (inv.notes) { y += 40; doc.setFont("helvetica","bold"); doc.text("Notes:", margin, y); y += 14; doc.setFont("helvetica","normal"); const noteLines = doc.splitTextToSize(inv.notes, pageWidth - margin*2); doc.text(noteLines, margin, y); }

    return doc;
  }

  async function downloadInvoicePDF(id: number) {
    const inv = invoices.find(x=> x.id===id); if (!inv) return;
    const pdf = await buildInvoicePDF(inv); const filename = `Invoice_${inv.clientName}_${inv.date}.pdf`;
    try { pdf.save(filename); } catch { const blobUrl = String(pdf.output("bloburl")); const a = document.createElement("a"); a.href = blobUrl; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(blobUrl), 5000); }
  }

  async function emailInvoicePDF(id: number) {
    const inv = invoices.find(x=> x.id===id); if (!inv) return; setSendingId(id);
    try {
      const pdf = await buildInvoicePDF(inv);
      const filename = `Invoice_${inv.clientName}_${inv.date}.pdf`;
      const subject = `Invoice — ${inv.clientName} — ${formatDateLongEnglish(inv.date)}`;
      const body = `Segue em anexo a fatura referente a ${formatDateLongEnglish(inv.date)} para ${inv.clientName}. Valor total: ${GBP(invoiceTotal(inv.items))}.`;
      await emailPdfBlob(pdf, filename, subject, body);
    } finally { setSendingId(null); }
  }

  // NEW: delete invoice
  const deleteInvoice = (id: number) => setInvoices(prev => {
    const next = prev.filter(inv => inv.id !== id);
    try { localStorage.setItem("cleaning_invoices_v1", JSON.stringify(next)); } catch {}
    return next;
  });

  // ==== Create invoice (form state) ====
  const [invDate, setInvDate] = useState<string>("");
  const [invClientName, setInvClientName] = useState<string>("");
  const [invClientAddr, setInvClientAddr] = useState<string>("");
  const [invItems, setInvItems] = useState<InvoiceItem[]>([{ description: "", amount: 0 }]);
  const [invPayMethod, setInvPayMethod] = useState<"cash" | "bank">("cash");
  const [invBankId, setInvBankId] = useState<string>("");
  const [invNotes, setInvNotes] = useState<string>("");

  function addItem() { setInvItems(items => [...items, { description: "", amount: 0 }]); }
  function updateItem(i:number, patch: Partial<InvoiceItem>) { setInvItems(items => items.map((it,idx)=> idx===i? { ...it, ...patch }: it)); }
  function removeItem(i:number) { setInvItems(items => items.filter((_,idx)=> idx!==i)); }

  function submitInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!invClientName || !invDate) { alert("Please fill date and client name."); return; }
    if (invItems.every(it => !it.description.trim() || !Number(it.amount))) { alert("Please add at least one item with amount."); return; }
    if (invPayMethod === "bank" && !invBankId) { alert("Select a bank account for transfer."); return; }
    const newInv: Invoice = {
      id: Date.now(), date: invDate, clientName: invClientName, clientAddress: invClientAddr,
      items: invItems.map(it=> ({ description: it.description.trim(), amount: Number(it.amount)||0 })),
      paymentMethod: invPayMethod, bankAccountId: invPayMethod==='bank'? invBankId: undefined, notes: invNotes
    };
    setInvoices(prev => [newInv, ...prev]);
    // reset and go to Reports → Invoices
    setInvDate(""); setInvClientName(""); setInvClientAddr(""); setInvItems([{ description:"", amount:0 }]); setInvPayMethod("cash"); setInvBankId(""); setInvNotes("");
    setView("reports"); setReportsTab("invoices");
  }

  // ==== Cleaning report submit (FIX: add missing onSubmit) ====
  const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    if (areas.length < 1) { alert("Please add at least one cleaned area."); return; }
    if (photos.length < 1) { alert("Please upload at least one photo."); return; }
    const cleanedAreas = areas.map(a => ({ siteName: a.siteName, sections: a.sections.map(s => s.trim()).filter(Boolean) }));
    const newReport: Report = {
      id: Date.now(),
      date,
      staffName,
      summary,
      notes,
      areas: cleanedAreas,
      photos: await Promise.all(photos.map(fileToJPEGDataURL))
    };
    setReports(prev => {
      const next = [newReport, ...prev];
      try { localStorage.setItem("cleaning_reports_v1", JSON.stringify(next)); } catch {}
      return next;
    });
    setView("reports");
    setReportsTab("jobs");
    setDate(""); setStaffName(""); setIsSummaryTouched(false); setSummary(""); setNotes(""); setAreas([{ siteName: "", sections: [""] }]); setPhotos([]);
  };

  // ========================= UI =========================
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-5xl">

        {/* Header */}
        <header className="mb-6 flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight">Cleaning Report</h1>
          {isAuthed && (
            <button onClick={logout} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-gray-50 text-red-600">
              <LogOut className="h-4 w-4" /> Logout
            </button>
          )}
        </header>

        {/* Login */}
        {!isAuthed && (
          <section className="mb-8 rounded-2xl border bg-white p-6 shadow-sm max-w-lg mx-auto">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold"><LogIn className="h-5 w-5" /> Admin Access</h2>
            <form onSubmit={handleAuthSubmit} className="grid grid-cols-1 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Username</span>
                <input type="text" required value={auth.email} onChange={(e) => setAuth({ ...auth, email: e.target.value })} placeholder="admin" className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium">Password</span>
                <input type="password" required value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} placeholder="••••••••" className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring" />
              </label>
              <div className="mt-2 flex justify-end">
                <button type="submit" className="rounded-2xl bg-black px-5 py-2 font-medium text-white shadow-sm hover:opacity-90">Enter</button>
              </div>
            </form>
          </section>
        )}

        {/* Dashboard */}
        {isAuthed && view === "dashboard" && (
          <section className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
            <button onClick={()=> setView("form")} className="group rounded-2xl border bg-white p-8 shadow-sm hover:shadow transition">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl border w-16 h-16 flex items-center justify-center group-hover:scale-105 transition">
                  <FileText className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">Create Report</h3>
                  <p className="text-sm text-gray-600">Fill details and generate PDF.</p>
                </div>
              </div>
            </button>

            <button onClick={()=> { setView("reports"); setReportsTab("jobs"); }} className="group rounded-2xl border bg-white p-8 shadow-sm hover:shadow transition">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl border w-16 h-16 flex items-center justify-center group-hover:scale-105 transition">
                  <FolderOpen className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">Reports</h3>
                  <p className="text-sm text-gray-600">Jobs & Invoices.</p>
                </div>
              </div>
            </button>

            <button onClick={()=> { setView("invoices"); }} className="group rounded-2xl border bg-white p-8 shadow-sm hover:shadow transition">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl border w-16 h-16 flex items-center justify-center group-hover:scale-105 transition">
                  <FileText className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">Invoices</h3>
                  <p className="text-sm text-gray-600">Create invoices (PDF).</p>
                </div>
              </div>
            </button>

            <button onClick={()=> setView("admin")} className="group rounded-2xl border bg-white p-8 shadow-sm hover:shadow transition">
              <div className="flex items-center gap-4">
                <div className="rounded-2xl border w-16 h-16 flex items-center justify-center group-hover:scale-105 transition">
                  <Settings2 className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold">Settings</h3>
                  <p className="text-sm text-gray-600">Areas, Sections & Bank.</p>
                </div>
              </div>
            </button>
          </section>
        )}

        {/* Back bar */}
        {isAuthed && view !== "dashboard" && (
          <div className="mb-4 flex items-center justify-between">
            <button onClick={()=> setView("dashboard")} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">⬅ Back to Menu</button>
            <button onClick={logout} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-gray-50 text-red-600"><LogOut className="h-4 w-4" /> Logout</button>
          </div>
        )}

        {/* Settings (Areas + Bank) */}
        {isAuthed && view === "admin" && (
          <section className="rounded-2xl border bg-white p-4 shadow-sm space-y-8">
            <div>
              <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold"><Settings2 className="h-5 w-5" /> Presets (Areas)</h2>
              <p className="text-sm text-gray-600 mb-3">Manage predefined Areas and Sections. These presets are offered during report creation.</p>
              <div className="space-y-4">
                {presets.map((p, i) => (
                  <div key={i} className="rounded-xl border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <input value={p.siteName} onChange={(e)=> setPresets(prev => prev.map((x,idx)=> idx===i? {...x, siteName:e.target.value}: x))} placeholder="Site name (e.g., Saxon House)" className="flex-1 rounded-xl border px-3 py-2 focus:outline-none focus:ring" />
                      <button className="rounded-xl border px-3 py-2 text-sm hover:bg-red-50 text-red-600" onClick={()=> setPresets(prev => prev.filter((_,idx)=> idx!==i))}><Trash2 className="inline h-4 w-4 mr-1"/> Remove</button>
                    </div>
                    <div className="space-y-2">
                      {p.sections.map((s, sIdx) => (
                        <div key={sIdx} className="flex items-center gap-2">
                          <input value={s} onChange={(e)=> setPresets(prev => prev.map((x,idx)=> idx===i? {...x, sections: x.sections.map((y,yy)=> yy===sIdx? e.target.value: y)}: x))} placeholder="Section / range" className="flex-1 rounded-xl border px-3 py-2 focus:outline-none focus:ring" />
                          <button className="rounded-xl border px-3 py-2 text-sm hover:bg-red-50 text-red-600" onClick={()=> setPresets(prev => prev.map((x,idx)=> idx===i? {...x, sections: x.sections.filter((_,yy)=> yy!==sIdx) }: x))}><Trash2 className="inline h-4 w-4 mr-1"/> Remove</button>
                        </div>
                      ))}
                      <button className="inline-flex items-center gap-2 rounded-2xl border px-3 py-1 text-sm hover:bg-gray-50" onClick={()=> setPresets(prev => prev.map((x,idx)=> idx===i? {...x, sections: [...x.sections, ""] }: x))}><Plus className="h-4 w-4"/> Add Section</button>
                    </div>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm hover:bg-gray-50" onClick={()=> setPresets(prev => [...prev, { siteName: "", sections: [""] }])}><Plus className="h-4 w-4"/> Add Area</button>
                  <button className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm hover:bg-gray-50" onClick={()=> { try { localStorage.setItem("cleaning_presets_v1", JSON.stringify(presets)); alert("Saved."); } catch { alert("Could not save."); }}}><Save className="h-4 w-4"/> Save</button>
                </div>
              </div>
            </div>

            <div>
              <h2 className="mb-2 text-xl font-semibold">Bank Accounts (UK)</h2>
              <p className="text-sm text-gray-600 mb-3">Used when invoices are paid by bank transfer (GBP).</p>
              <div className="space-y-3">
                {bankAccounts.map((b, i)=>(
                  <div key={b.id} className="rounded-xl border p-3 space-y-2">
                    <div className="grid sm:grid-cols-2 gap-2">
                      <input className="rounded-xl border px-3 py-2" placeholder="Bank name" value={b.bankName} onChange={(e)=> setBankAccounts(list=> list.map((x,idx)=> idx===i? {...x, bankName:e.target.value}: x))}/>
                      <input className="rounded-xl border px-3 py-2" placeholder="Account name" value={b.accountName} onChange={(e)=> setBankAccounts(list=> list.map((x,idx)=> idx===i? {...x, accountName:e.target.value}: x))}/>
                      <input className="rounded-xl border px-3 py-2" placeholder="Sort code" value={b.sortCode} onChange={(e)=> setBankAccounts(list=> list.map((x,idx)=> idx===i? {...x, sortCode:e.target.value}: x))}/>
                      <input className="rounded-xl border px-3 py-2" placeholder="Account number" value={b.accountNumber} onChange={(e)=> setBankAccounts(list=> list.map((x,idx)=> idx===i? {...x, accountNumber:e.target.value}: x))}/>
                      <input className="rounded-xl border px-3 py-2" placeholder="IBAN (optional)" value={b.iban||""} onChange={(e)=> setBankAccounts(list=> list.map((x,idx)=> idx===i? {...x, iban:e.target.value}: x))}/>
                      <input className="rounded-xl border px-3 py-2" placeholder="Reference note (optional)" value={b.referenceNote||""} onChange={(e)=> setBankAccounts(list=> list.map((x,idx)=> idx===i? {...x, referenceNote:e.target.value}: x))}/>
                    </div>
                    <button className="rounded-xl border px-3 py-2 text-sm text-red-600 hover:bg-red-50" onClick={()=> setBankAccounts(list=> list.filter((_,idx)=> idx!==i))}><Trash2 className="inline h-4 w-4 mr-1"/> Remove account</button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <button className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm hover:bg-gray-50" onClick={()=> setBankAccounts(list=> [...list, { id: crypto.randomUUID(), bankName:"", accountName:"", sortCode:"", accountNumber:"" }])}><Plus className="h-4 w-4"/> Add Bank</button>
                  <button className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm hover:bg-gray-50" onClick={()=> { try { localStorage.setItem("bank_accounts_v1", JSON.stringify(bankAccounts)); alert("Saved."); } catch { alert("Could not save."); }}}><Save className="h-4 w-4"/> Save</button>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Create Cleaning Report */}
        {isAuthed && view === "form" && (
          <form onSubmit={onSubmit} className="space-y-6">
            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold"><FileText className="h-5 w-5"/> Report Details</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Date</span>
                  <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring" />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm font-medium">Staff Name</span>
                  <input type="text" required placeholder="e.g., Gustavo" value={staffName} onChange={(e) => setStaffName(e.target.value)} className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring" />
                </label>
              </div>
              <label className="mt-4 flex flex-col gap-1">
                <span className="text-sm font-medium">Summary of Work</span>
                <textarea required placeholder="Auto-filled from template. You can edit if needed." value={summary} onChange={(e) => { setSummary(e.target.value); setIsSummaryTouched(true); }} className="min-h-[96px] w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring" />
              </label>
            </section>

            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-xl font-semibold"><Building2 className="h-5 w-5"/> Areas Cleaned</h2>
                {presets.length>0 && (
                  <div className="flex items-center gap-2">
                    <label className="text-sm">Target area:</label>
                    <select className="rounded-xl border px-2 py-1 text-sm" value={targetAreaIdx} onChange={(e)=> setTargetAreaIdx(parseInt(e.target.value))}>
                      {areas.map((a,idx)=> (<option key={idx} value={idx}>{`Area ${idx+1}${a.siteName? ' - '+a.siteName:''}`}</option>))}
                    </select>

                    <div className="relative">
                      <details className="group">
                        <summary className="list-none inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"><ChevronDown className="h-4 w-4"/> Insert Area</summary>
                        <div className="absolute right-0 z-10 mt-1 w-64 rounded-xl border bg-white p-2 shadow-lg">
                          {presets.map((p,i)=>(
                            <button type="button" key={i} onClick={()=> insertAreaFromPreset(p)} className="block w-full text-left rounded-lg px-2 py-1 hover:bg-gray-50 text-sm">{p.siteName || `Preset ${i+1}`}</button>
                          ))}
                        </div>
                      </details>
                    </div>

                    <div className="relative">
                      <details className="group">
                        <summary className="list-none inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"><ChevronDown className="h-4 w-4"/> Insert Sections</summary>
                        <div className="absolute right-0 z-10 mt-1 w-72 max-h-72 overflow-auto rounded-xl border bg-white p-2 shadow-lg">
                          {presets.length === 0 && (<div className="px-2 py-1 text-sm text-gray-500">No presets</div>)}
                          {presets.map((p,i)=> (
                            <div key={i} className="mb-2 last:mb-0">
                              {p.sections.filter(Boolean).map((sec, sIdx)=> (
                                <button type="button" key={`${i}-${sIdx}`} onClick={()=> insertSectionFromPreset(sec)} className="block w-full truncate text-left rounded-lg px-2 py-1 hover:bg-gray-50 text-sm" title={`${p.siteName || `Preset ${i+1}`} — ${sec}`}>{sec}</button>
                              ))}
                            </div>
                          ))}
                        </div>
                      </details>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {areas.map((area, i) => (
                  <div key={i} className="space-y-3 rounded-xl border p-3">
                    <input type="text" placeholder="Site name (e.g., Saxon House)" value={area.siteName} onChange={(e) => updateAreaName(i, e.target.value)} className="w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring" />

                    <div className="space-y-2">
                      {area.sections.map((sec, sIdx) => (
                        <div key={sIdx} className="flex items-center gap-2">
                          <input type="text" placeholder="Section / range (e.g., Area 1-77)" value={sec} onChange={(e) => updateSection(i, sIdx, e.target.value)} className="flex-1 rounded-xl border px-3 py-2 focus:outline-none focus:ring" />
                          <button type="button" onClick={() => removeSection(i, sIdx)} className="rounded-xl border px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 className="mr-1 inline h-4 w-4"/> Remove</button>
                        </div>
                      ))}
                      <button type="button" onClick={() => addSection(i)} className="inline-flex items-center gap-2 rounded-2xl border px-3 py-1 text-sm hover:bg-gray-50"><Plus className="h-4 w-4"/> Add Section</button>
                    </div>

                    <button type="button" onClick={() => removeArea(i)} className="rounded-xl border px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 className="mr-1 inline h-4 w-4"/> Remove Area</button>
                  </div>
                ))}
                <button type="button" onClick={addArea} className="inline-flex items-center gap-2 rounded-2xl border px-3 py-2 text-sm hover:bg-gray-50"><Plus className="h-4 w-4"/> Add Area</button>
              </div>
            </section>

            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold"><FileText className="h-5 w-5"/> Additional Notes</h2>
              <textarea placeholder="Any additional notes about dust removal, machinery used, etc." value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[96px] w-full rounded-xl border px-3 py-2 focus:outline-none focus:ring" />
            </section>

            <section className="rounded-2xl border bg-white p-4 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold"><ImageIcon className="h-5 w-5"/> Photos</h2>
              <div className="rounded-xl border border-dashed p-6 text-center">
                <input id="photos" type="file" accept="image/*" multiple onChange={(e)=>{
                  const files = e.target.files ? Array.from(e.target.files) : [];
                  const accepted = files.filter((f) => /\.(jpe?g|png|webp)$/i.test(f.name));
                  setPhotos((prev) => [...prev, ...accepted].slice(0, 20));
                }} className="hidden" />
                <label htmlFor="photos" className="inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 hover:bg-gray-50"><Upload className="h-4 w-4"/> Upload Photos</label>
                {photos.length > 0 && (
                  <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {photos.map((file, i) => (
                      <li key={i} className="rounded-xl border p-2 text-left text-sm">
                        <div className="truncate">{file.name}</div>
                        <button type="button" onClick={() => setPhotos(p => p.filter((_, idx)=> idx!==i))} className="mt-2 rounded-lg border px-2 py-1 text-xs text-red-600 hover:bg-red-50">Remove</button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            <div className="flex justify-end">
              <button type="submit" className="rounded-2xl bg-black px-5 py-2 font-medium text-white shadow-sm hover:opacity-90">Submit Report</button>
            </div>
          </form>
        )}

        {/* Reports (Jobs & Invoices tabs) */}
        {isAuthed && view === "reports" && (
          <section className="rounded-2xl border bg-white p-4 shadow-sm space-y-6">
            <div className="flex items-center gap-2">
              <button onClick={()=> setReportsTab("jobs")} className={`rounded-xl border px-3 py-1 text-sm ${reportsTab==='jobs' ? 'bg-black text-white' : 'hover:bg-gray-50'}`}>Jobs</button>
              <button onClick={()=> setReportsTab("invoices")} className={`rounded-xl border px-3 py-1 text-sm ${reportsTab==='invoices' ? 'bg-black text-white' : 'hover:bg-gray-50'}`}>Invoices</button>
            </div>

            {reportsTab === "jobs" && (
              <div>
                <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold"><FolderOpen className="h-5 w-5"/> Job Reports</h2>
                {reports.length === 0 ? (
                  <p className="text-gray-600">No reports available.</p>
                ) : (
                  <ul className="space-y-4">
                    {reports.map((r) => (
                      <li key={r.id} className="rounded-xl border p-4 flex justify-between items-center">
                        <div>
                          <p className="font-medium">{r.staffName} - {formatDateLongEnglish(r.date)}</p>
                          <p className="text-sm text-gray-500">{r.summary.slice(0, 80)}...</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => downloadReportPDF(r.id)} className="inline-flex items-center gap-1 rounded-xl border px-3 py-1 text-sm hover:bg-gray-50"><Download className="h-4 w-4"/> PDF</button>
                          <button onClick={() => emailReportPDF(r.id)} className="inline-flex items-center gap-1 rounded-xl border px-3 py-1 text-sm hover:bg-gray-50" disabled={sendingId === r.id}>
                            <Mail className="h-4 w-4"/>{sendingId === r.id ? "Enviando..." : "Email"}
                          </button>
                          <button onClick={() => deleteReport(r.id)} className="inline-flex items-center gap-1 rounded-xl border px-3 py-1 text-sm hover:bg-red-50 text-red-600"><Trash2 className="h-4 w-4"/> Delete</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {reportsTab === "invoices" && (
              <div className="space-y-6">
                <div className="rounded-2xl border bg-white p-4 shadow-sm">
                  <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold"><FolderOpen className="h-5 w-5"/> Invoice Reports</h2>
                  {invoices.length===0 ? (
                    <p className="text-gray-600">No invoices yet.</p>
                  ) : (
                    <ul className="space-y-3">
                      {invoices.map(inv=> (
                        <li key={inv.id} className="rounded-xl border p-3 flex items-center justify-between">
                          <div>
                            <div className="font-medium">{inv.clientName} — {formatDateLongEnglish(inv.date)}</div>
                            <div className="text-sm text-gray-600">Items: {inv.items.length} · Total {GBP(invoiceTotal(inv.items))} · {inv.paymentMethod==='cash'? 'Cash' : 'Bank Transfer'}</div>
                          </div>
                          <div className="flex gap-2">
                            <button onClick={()=> downloadInvoicePDF(inv.id)} className="rounded-xl border px-3 py-1 text-sm hover:bg-gray-50 inline-flex items-center gap-1"><Download className="h-4 w-4"/> PDF</button>
                            <button onClick={()=> emailInvoicePDF(inv.id)} disabled={sendingId===inv.id} className="rounded-xl border px-3 py-1 text-sm hover:bg-gray-50 inline-flex items-center gap-1"><Mail className="h-4 w-4"/>{sendingId===inv.id? 'Enviando…':'Email'}</button>
                            <button onClick={()=> deleteInvoice(inv.id)} className="rounded-xl border px-3 py-1 text-sm hover:bg-red-50 inline-flex items-center gap-1 text-red-600"><Trash2 className="h-4 w-4"/> Delete</button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Invoices (Create only) */}
        {isAuthed && view === "invoices" && (
          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold"><FileText className="h-5 w-5"/> Create Invoice</h2>
            <form onSubmit={submitInvoice} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1"><span className="text-sm font-medium">Date</span>
                  <input type="date" required value={invDate} onChange={e=> setInvDate(e.target.value)} className="rounded-xl border px-3 py-2"/>
                </label>
                <label className="flex flex-col gap-1"><span className="text-sm font-medium">Client Name</span>
                  <input required value={invClientName} onChange={e=> setInvClientName(e.target.value)} placeholder="e.g., Saxon House" className="rounded-xl border px-3 py-2"/>
                </label>
              </div>
              <label className="flex flex-col gap-1"><span className="text-sm font-medium">Client Address</span>
                <textarea value={invClientAddr} onChange={e=> setInvClientAddr(e.target.value)} placeholder="Street, City, Postcode" className="min-h-[72px] rounded-xl border px-3 py-2"/>
              </label>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">Items</span>
                  <button type="button" onClick={addItem} className="rounded-xl border px-3 py-1 text-sm hover:bg-gray-50"><Plus className="h-4 w-4 inline mr-1"/> Add</button>
                </div>
                <div className="space-y-2">
                  {invItems.map((it, i)=> (
                    <div key={i} className="grid grid-cols-12 gap-2">
                      <input className="col-span-9 rounded-xl border px-3 py-2" placeholder={`Description #${i+1}`} value={it.description} onChange={e=> updateItem(i, { description: e.target.value })}/>
                      <input className="col-span-2 rounded-xl border px-3 py-2" type="number" min="0" step="0.01" placeholder="Amount" value={it.amount} onChange={e=> updateItem(i, { amount: Number(e.target.value) })}/>
                      <button type="button" onClick={()=> removeItem(i)} className="col-span-1 rounded-xl border px-3 py-2 text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4"/></button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 text-right text-sm text-gray-700">Total: <strong>{GBP(invoiceTotal(invItems))}</strong></div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <label className="flex flex-col gap-1"><span className="text-sm font-medium">Payment Method</span>
                  <select value={invPayMethod} onChange={e=> setInvPayMethod(e.target.value as any)} className="rounded-xl border px-3 py-2">
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                  </select>
                </label>
                {invPayMethod === "bank" && (
                  <label className="flex flex-col gap-1"><span className="text-sm font-medium">Bank Account (UK)</span>
                    <select value={invBankId} onChange={e=> setInvBankId(e.target.value)} className="rounded-xl border px-3 py-2">
                      <option value="">Select an account…</option>
                      {bankAccounts.map(b=> (<option key={b.id} value={b.id}>{`${b.bankName} — ${b.accountName}`}</option>))}
                    </select>
                  </label>
                )}
              </div>

              <label className="flex flex-col gap-1"><span className="text-sm font-medium">Notes (optional)</span>
                <textarea value={invNotes} onChange={e=> setInvNotes(e.target.value)} className="min-h-[64px] rounded-xl border px-3 py-2"/>
              </label>

              <div className="flex justify-end"><button className="rounded-2xl bg-black px-5 py-2 font-medium text-white shadow-sm hover:opacity-90" type="submit">Generate Invoice</button></div>
              <p className="mt-2 text-xs text-gray-500">After generating, find it under <strong>Reports → Invoices</strong>.</p>
            </form>
          </section>
        )}
      </motion.div>
    </div>
  );
}

// ========================= Self-tests (dev) =========================
(function runDevTests(){
  try {
    console.groupCollapsed("Self-tests: Cleaning Report App");
    // ordinal tests (expanded)
    console.assert(ordinal(1) === "1st", "ordinal 1");
    console.assert(ordinal(2) === "2nd", "ordinal 2");
    console.assert(ordinal(3) === "3rd", "ordinal 3");
    console.assert(ordinal(11) === "11th", "ordinal 11");
    console.assert(ordinal(21) === "21st", "ordinal 21");
    console.assert(ordinal(23) === "23rd", "ordinal 23");
    console.assert(ordinal(112) === "112th", "ordinal 112");

    // date format
    const d = formatDateLongEnglish("2025-08-13");
    console.assert(/August/.test(d) && /13/.test(d), "format date long");
    const dEmpty = formatDateLongEnglish("");
    console.assert(dEmpty === "", "format returns empty on empty input");

    // currency helper
    const gbp = new Intl.NumberFormat("en-GB", { style:"currency", currency:"GBP" }).format(12.5);
    console.assert(gbp.includes("£"), "GBP symbol present");

    // invoice total
    const items: any = [{amount: 10}, {amount: 2.5}, {amount: 0.4}];
    const sum = items.reduce((s:any,x:any)=> s + x.amount, 0);
    console.assert(Math.abs(sum - 12.9) < 1e-9, "sum sanity");

    // summary template contains name and placeholders
    console.assert(SUMMARY_TEMPLATE("Alex", "2025-01-05").toLowerCase().includes("alex"), "summary template name");
    const templEmpty = SUMMARY_TEMPLATE("", "");
    console.assert(templEmpty.includes("[Staff Name]") && templEmpty.includes("[Date]"), "template placeholders when empty");

    console.groupEnd();
  } catch (e) {
    console.error("Self-tests failed", e);
  }
})();
