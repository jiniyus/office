import { Layout } from "@/components/layout";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useStockItems } from "@/lib/firestore-hooks";
import type { StockItem } from "@/lib/types";
import {
  getBalanceSnapshots,
  getAdvancedTransactionAudit,
  recalculateAdvancedState,
  restoreBalanceSnapshot,
  type AdvancedTransactionAuditRow,
  type BalanceSnapshotSummary,
} from "@/lib/advanced-history";
import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { ChevronDown, Wrench, Search, FileText, RotateCcw } from "lucide-react";

const PDF_PAGE_WIDTH = 595;
const PDF_PAGE_HEIGHT = 842;
const PDF_MARGIN = 42;
const PDF_ROW_HEIGHT = 13;
const PDF_TABLE_COLUMNS = [
  { label: "Name", x: PDF_MARGIN, width: 150, maxLength: 22 },
  { label: "Category", x: PDF_MARGIN + 150, width: 130, maxLength: 18 },
  { label: "HT", x: PDF_MARGIN + 280, width: 45, maxLength: 8 },
  { label: "Factory", x: PDF_MARGIN + 325, width: 65, maxLength: 10 },
  { label: "Office", x: PDF_MARGIN + 390, width: 65, maxLength: 10 },
  { label: "Total", x: PDF_MARGIN + 455, width: 56, maxLength: 10 },
];
const PDF_TABLE_RIGHT = PDF_TABLE_COLUMNS[PDF_TABLE_COLUMNS.length - 1].x + PDF_TABLE_COLUMNS[PDF_TABLE_COLUMNS.length - 1].width;
const PDF_ZERO_PARTIAL_FILL = "1 0.96 0.56";
const PDF_ZERO_ALL_FILL = "1 0.78 0.78";

const escapePdfText = (value: string) =>
  value
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const fitPdfText = (value: string, maxLength: number) => {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
};

const addPdfText = (lines: string[], text: string, x: number, y: number, size = 10, bold = false) => {
  const font = bold ? "/F2" : "/F1";
  lines.push(`BT 0 0 0 rg ${font} ${size} Tf ${x} ${y} Td (${escapePdfText(text)}) Tj ET`);
};

const addPdfLine = (lines: string[], x1: number, y1: number, x2: number, y2: number) => {
  lines.push(`0 0 0 RG ${x1} ${y1} m ${x2} ${y2} l S`);
};

const addPdfRect = (lines: string[], x: number, y: number, width: number, height: number, fillColor: string) => {
  lines.push(`${fillColor} rg ${x} ${y} ${width} ${height} re f`);
};

const addPdfTableRow = (lines: string[], topY: number, values: string[], bold = false, fillColor?: string) => {
  const bottomY = topY - PDF_ROW_HEIGHT;
  if (fillColor) {
    addPdfRect(lines, PDF_MARGIN, bottomY, PDF_TABLE_RIGHT - PDF_MARGIN, PDF_ROW_HEIGHT, fillColor);
  }

  addPdfLine(lines, PDF_MARGIN, topY, PDF_TABLE_RIGHT, topY);
  addPdfLine(lines, PDF_MARGIN, bottomY, PDF_TABLE_RIGHT, bottomY);

  PDF_TABLE_COLUMNS.forEach((column) => {
    addPdfLine(lines, column.x, bottomY, column.x, topY);
  });
  addPdfLine(lines, PDF_TABLE_RIGHT, bottomY, PDF_TABLE_RIGHT, topY);

  PDF_TABLE_COLUMNS.forEach((column, index) => {
    addPdfText(lines, fitPdfText(values[index] || "", column.maxLength), column.x + 4, topY - 9, 9, bold);
  });
};

const buildStockBalancePdf = (items: StockItem[], createdAt: Date, company?: string) => {
  const sortedItems = [...items].sort((a, b) => {
    const nameCompare = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    if (nameCompare !== 0) return nameCompare;
    return a.category.localeCompare(b.category, undefined, { numeric: true, sensitivity: "base" });
  });

  const createdLabel = format(createdAt, "MMM dd, yyyy HH:mm:ss");
  const pages: string[] = [];
  let pageLines: string[] = [];
  let y = PDF_PAGE_HEIGHT - PDF_MARGIN;
  let pageNumber = 1;

  const startPage = () => {
    pageLines = [];
    y = PDF_PAGE_HEIGHT - PDF_MARGIN;
    addPdfText(pageLines, "Stock Balance Report", PDF_MARGIN, y, 18, true);
    y -= 26;
    addPdfText(pageLines, `Created: ${createdLabel}`, PDF_MARGIN, y, 9, true);
    y -= 12;
    if (company) {
      addPdfText(pageLines, `Company: ${company}`, PDF_MARGIN, y, 9, true);
      y -= 12;
    }
    addPdfText(pageLines, `Items: ${sortedItems.length}`, PDF_MARGIN, y, 9, true);
    addPdfText(pageLines, `Page ${pageNumber}`, PDF_PAGE_WIDTH - 90, y, 9, true);
    y -= 14;
    addPdfRect(pageLines, PDF_MARGIN, y - 8, 8, 8, PDF_ZERO_PARTIAL_FILL);
    addPdfText(pageLines, "One or more location balances are zero", PDF_MARGIN + 12, y - 7, 8);
    addPdfRect(pageLines, 290, y - 8, 8, 8, PDF_ZERO_ALL_FILL);
    addPdfText(pageLines, "All location balances are zero", 302, y - 7, 8);
    y -= 16;
    
    addPdfTableRow(
      pageLines,
      y,
      PDF_TABLE_COLUMNS.map((column) => column.label),
      true
    );
    y -= PDF_ROW_HEIGHT;
  };

  const finishPage = () => {
    pages.push(pageLines.join("\n"));
    pageNumber += 1;
  };

  startPage();

  if (sortedItems.length === 0) {
    addPdfText(pageLines, "No stock items found.", PDF_MARGIN, y, 10);
  }

  sortedItems.forEach((item) => {
    if (y - PDF_ROW_HEIGHT < PDF_MARGIN) {
      finishPage();
      startPage();
    }

    const ht = item.heatTreatmentBalance || 0;
    const factory = item.factoryBalance || 0;
    const office = item.officeBalance || 0;
    const total = ht + factory + office;
    const zeroBalanceCount = [ht, factory, office].filter((balance) => balance === 0).length;
    const rowFillColor =
      zeroBalanceCount === 3 ? PDF_ZERO_ALL_FILL : zeroBalanceCount > 0 ? PDF_ZERO_PARTIAL_FILL : undefined;

    addPdfTableRow(pageLines, y, [
      item.name,
      item.category,
      String(ht),
      String(factory),
      String(office),
      String(total),
    ], false, rowFillColor);
    y -= PDF_ROW_HEIGHT;
  });

  finishPage();

  const objects: string[] = [];
  const pageRefs = pages.map((_, index) => `${5 + index * 2} 0 R`).join(" ");
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageRefs}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  pages.forEach((content, index) => {
    const pageObjectId = 5 + index * 2;
    const contentObjectId = pageObjectId + 1;
    objects[pageObjectId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
    objects[contentObjectId] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
  });

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = pdf.length;
    pdf += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let index = 1; index < objects.length; index += 1) {
    pdf += `${offsets[index].toString().padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([pdf], { type: "application/pdf" });
};

export default function Profile() {
  const { user } = useAuth();
  const { items, loading: isLoadingStockItems } = useStockItems();
  const { toast } = useToast();
  const [adminPassword, setAdminPassword] = useState("");
  const [selectedAuditItemId, setSelectedAuditItemId] = useState("");
  const [isAuditPickerOpen, setIsAuditPickerOpen] = useState(false);
  const [auditRows, setAuditRows] = useState<AdvancedTransactionAuditRow[]>([]);
  const [balanceSnapshots, setBalanceSnapshots] = useState<BalanceSnapshotSummary[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [isSnapshotPickerOpen, setIsSnapshotPickerOpen] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);
  const [isLoadingSnapshots, setIsLoadingSnapshots] = useState(false);
  const [isRestoringSnapshot, setIsRestoringSnapshot] = useState(false);

  const sortedItems = useMemo(
    () =>
      [...items].sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
        if (nameCompare !== 0) return nameCompare;
        return a.category.localeCompare(b.category, undefined, { numeric: true, sensitivity: "base" });
      }),
    [items]
  );

  const selectedAuditItem = items.find((entry) => entry.id === selectedAuditItemId);
  const selectedAuditLabel = selectedAuditItem
    ? `${selectedAuditItem.name} - ${selectedAuditItem.category}`
    : "Select item to inspect";
  const selectedSnapshot = balanceSnapshots.find((snapshot) => snapshot.id === selectedSnapshotId);
  const selectedSnapshotLabel = selectedSnapshot
    ? `${format(selectedSnapshot.createdAt, "MMM dd, yyyy HH:mm:ss")} - ${selectedSnapshot.reason.replaceAll("_", " ")}`
    : "Select snapshot to restore";

  useEffect(() => {
    setAdminPassword("");
    const clearAutofill = window.setTimeout(() => setAdminPassword(""), 100);
    return () => window.clearTimeout(clearAutofill);
  }, []);

  const validateAdminPassword = () => {
    if (adminPassword !== "4321") {
      toast({
        variant: "destructive",
        title: "Incorrect password",
        description: "Enter the admin tools password.",
      });
      return false;
    }

    return true;
  };

  const handleRecalculateAll = async () => {
    if (!validateAdminPassword()) return;

    try {
      setIsRecalculating(true);
      await recalculateAdvancedState(user?.company, {
        id: user?.uid || "",
        name: user?.displayName || "Unknown",
      });
      toast({
        title: "Recalculation complete",
        description: "All advanced stock balances were rebuilt from transaction history.",
      });
    } catch (error) {
      console.error("Error recalculating stock:", error);
      toast({
        variant: "destructive",
        title: "Recalculation failed",
        description: "Could not rebuild stock balances.",
      });
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleLoadSnapshots = async () => {
    if (!validateAdminPassword()) return;

    try {
      setIsLoadingSnapshots(true);
      const snapshots = await getBalanceSnapshots(user?.company);
      setBalanceSnapshots(snapshots);
      setSelectedSnapshotId((current) =>
        current && snapshots.some((snapshot) => snapshot.id === current)
          ? current
          : snapshots[0]?.id || ""
      );
      toast({
        title: "Snapshots loaded",
        description: `Found ${snapshots.length} balance snapshot(s).`,
      });
    } catch (error) {
      console.error("Error loading balance snapshots:", error);
      toast({
        variant: "destructive",
        title: "Snapshot load failed",
        description: "Could not load saved balance snapshots.",
      });
    } finally {
      setIsLoadingSnapshots(false);
    }
  };

  const handleRestoreSnapshot = async () => {
    if (!validateAdminPassword()) return;
    if (!selectedSnapshotId) {
      toast({
        variant: "destructive",
        title: "Select a snapshot",
        description: "Choose a saved balance snapshot before restoring.",
      });
      return;
    }

    try {
      setIsRestoringSnapshot(true);
      const restoredCount = await restoreBalanceSnapshot(selectedSnapshotId);
      toast({
        title: "Snapshot restored",
        description: `Restored balances for ${restoredCount} item(s).`,
      });
    } catch (error) {
      console.error("Error restoring balance snapshot:", error);
      toast({
        variant: "destructive",
        title: "Restore failed",
        description: "Could not restore balances from the selected snapshot.",
      });
    } finally {
      setIsRestoringSnapshot(false);
    }
  };

  const handleLoadAudit = async () => {
    if (!validateAdminPassword()) return;

    const item = items.find((entry) => entry.id === selectedAuditItemId);
    if (!item) {
      toast({
        variant: "destructive",
        title: "Select an item",
        description: "Choose a stock item before loading the audit.",
      });
      return;
    }

    try {
      setIsLoadingAudit(true);
      const rows = await getAdvancedTransactionAudit(user?.company, item.name, item.category);
      setAuditRows(rows);
      toast({
        title: "Audit loaded",
        description: `Found ${rows.length} replay entries for ${item.name}.`,
      });
    } catch (error) {
      console.error("Error loading transaction audit:", error);
      toast({
        variant: "destructive",
        title: "Audit failed",
        description: "Could not load replay audit.",
      });
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const handleDownloadStockBalancePdf = () => {
    try {
      const createdAt = new Date();
      const pdfBlob = buildStockBalancePdf(items, createdAt, user?.company);
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `stock-balances-${format(createdAt, "yyyy-MM-dd-HHmm")}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast({
        title: "PDF created",
        description: "The current stock balance report has been downloaded.",
      });
    } catch (error) {
      console.error("Error creating stock balance PDF:", error);
      toast({
        variant: "destructive",
        title: "PDF failed",
        description: "Could not create the stock balance report.",
      });
    }
  };

  const formatDateTime = (date?: Date) => (date ? format(date, "MMM dd, yyyy HH:mm:ss") : "-");
  const formatBalances = (balances: { ht: number; fa: number; of: number }) =>
    `HT ${balances.ht} / FA ${balances.fa} / OF ${balances.of}`;

  return (
    <Layout>
      <div className="flex flex-col gap-8 max-w-4xl mx-auto">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">Account Settings</h1>
          <p className="text-slate-500 mt-1">View your account information.</p>
        </div>

        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Your account details are displayed below.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Full Name</Label>
                  <Input defaultValue={user?.displayName} disabled className="bg-slate-50" />
                </div>
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input defaultValue={user?.email} disabled className="bg-slate-50" />
                </div>
                <div className="space-y-2">
                  <Label>Role</Label>
                  <div className="flex items-center h-10">
                    <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">Administrator</Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stock Balance PDF</CardTitle>
              <CardDescription>Download a simple report of current balances across all locations.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-500">
                Includes item name, category, heat treatment, factory, office, and total stock.
              </p>
              <Button onClick={handleDownloadStockBalancePdf} disabled={isLoadingStockItems}>
                <FileText className="mr-2 h-4 w-4" />
                {isLoadingStockItems ? "Loading Stock..." : "Download PDF"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Admin Repair Tools</CardTitle>
              <CardDescription>Rebuild balances and inspect transaction replay order.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
                <div className="space-y-2">
                  <Label>Admin Password</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    autoComplete="one-time-code"
                    name="admin-action-code"
                    value={adminPassword}
                    onChange={(event) =>
                      setAdminPassword(event.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    placeholder="Enter password"
                  />
                </div>
                <Button onClick={handleRecalculateAll} disabled={isRecalculating}>
                  <Wrench className="mr-2 h-4 w-4" />
                  {isRecalculating ? "Recalculating..." : "Recalculate All Stock"}
                </Button>
              </div>

              <div className="grid gap-4 border-t border-slate-100 pt-6 md:grid-cols-[1fr_auto_auto] md:items-end">
                <div className="space-y-2">
                  <Label>Balance Snapshot</Label>
                  <div className="relative">
                    <button
                      type="button"
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-white px-3 text-left text-sm shadow-sm"
                      onClick={() => setIsSnapshotPickerOpen((current) => !current)}
                    >
                      <span className={selectedSnapshot ? "text-slate-900" : "text-slate-500"}>
                        {selectedSnapshotLabel}
                      </span>
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    </button>

                    {isSnapshotPickerOpen && (
                      <div className="absolute z-20 mt-1 h-40 w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                        {balanceSnapshots.length === 0 ? (
                          <div className="px-2 py-1.5 text-sm text-slate-500">No snapshots loaded</div>
                        ) : (
                          balanceSnapshots.map((snapshot) => {
                            const isSelected = selectedSnapshotId === snapshot.id;
                            return (
                              <button
                                key={snapshot.id}
                                type="button"
                                className={`flex w-full flex-col rounded-sm px-2 py-1.5 text-left text-sm transition-colors ${
                                  isSelected
                                    ? "bg-primary text-primary-foreground"
                                    : "text-slate-700 hover:bg-slate-100"
                                }`}
                                onClick={() => {
                                  setSelectedSnapshotId(snapshot.id);
                                  setIsSnapshotPickerOpen(false);
                                }}
                              >
                                <span>{format(snapshot.createdAt, "MMM dd, yyyy HH:mm:ss")}</span>
                                <span className={isSelected ? "text-primary-foreground/80" : "text-slate-500"}>
                                  {snapshot.reason.replaceAll("_", " ")} - {snapshot.itemCount} items
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <Button variant="outline" onClick={handleLoadSnapshots} disabled={isLoadingSnapshots}>
                  <Search className="mr-2 h-4 w-4" />
                  {isLoadingSnapshots ? "Loading..." : "Load Snapshots"}
                </Button>
                <Button onClick={handleRestoreSnapshot} disabled={isRestoringSnapshot || !selectedSnapshotId}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {isRestoringSnapshot ? "Restoring..." : "Restore Snapshot"}
                </Button>
              </div>

              <div className="grid gap-4 border-t border-slate-100 pt-6 md:grid-cols-[1fr_auto] md:items-end">
                <div className="space-y-2">
                  <Label>Transaction Audit Item</Label>
                  <div className="relative">
                    <button
                      type="button"
                      className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-white px-3 text-left text-sm shadow-sm"
                      onClick={() => setIsAuditPickerOpen((current) => !current)}
                    >
                      <span className={selectedAuditItem ? "text-slate-900" : "text-slate-500"}>
                        {selectedAuditLabel}
                      </span>
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    </button>

                    {isAuditPickerOpen && (
                      <div className="absolute z-20 mt-1 h-36 w-full overflow-y-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg">
                        {sortedItems.map((item) => {
                          const isSelected = selectedAuditItemId === item.id;
                          return (
                            <button
                              key={item.id}
                              type="button"
                              className={`flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm transition-colors ${
                                isSelected
                                  ? "bg-primary text-primary-foreground"
                                  : "text-slate-700 hover:bg-slate-100"
                              }`}
                              onClick={() => {
                                setSelectedAuditItemId(item.id);
                                setIsAuditPickerOpen(false);
                              }}
                            >
                              {item.name} - {item.category}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
                <Button variant="outline" onClick={handleLoadAudit} disabled={isLoadingAudit}>
                  <Search className="mr-2 h-4 w-4" />
                  {isLoadingAudit ? "Loading..." : "Load Audit"}
                </Button>
              </div>

              {auditRows.length > 0 && (
                <div className="overflow-x-auto rounded-md border border-slate-200">
                  <table className="w-full min-w-[780px] text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2 font-semibold">Order</th>
                        <th className="px-3 py-2 font-semibold">Type</th>
                        <th className="px-3 py-2 font-semibold">Qty</th>
                        <th className="px-3 py-2 font-semibold">Actual Time</th>
                        <th className="px-3 py-2 font-semibold">Business Date</th>
                        <th className="px-3 py-2 font-semibold">Before</th>
                        <th className="px-3 py-2 font-semibold">After</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {auditRows.map((row, index) => (
                        <tr key={row.id} className="bg-white">
                          <td className="px-3 py-2 text-slate-500">{index + 1}</td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-900">{row.type.replaceAll("_", " ")}</div>
                            {row.groupId && <div className="text-xs text-slate-500">{row.groupId}</div>}
                          </td>
                          <td className="px-3 py-2 font-semibold">{row.quantityChange}</td>
                          <td className="px-3 py-2 text-slate-600">{formatDateTime(row.timestamp)}</td>
                          <td className="px-3 py-2 text-slate-600">
                            {row.businessDate ? format(row.businessDate, "MMM dd, yyyy") : "-"}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{formatBalances(row.before)}</td>
                          <td className="px-3 py-2 font-medium text-slate-900">{formatBalances(row.after)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
