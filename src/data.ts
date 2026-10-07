import { careerRoadmapMonths } from "./career-roadmap";

export interface ArchiveRecord {
  id: string;
  title: string;
  en: string;
  department: string;
  category: string;
  date: string;
  lead: string;
  clearance: string;
  abstract: string;
  findings: string[];
  source: string;
}

export const archiveColumns = ["01–03 / 阶段一", "04–06 / 阶段二", "07–09 / 阶段三", "10–12 / 阶段四"];
export const categories = ["全部档案", ...archiveColumns];
// One blank selectable worksheet per month keeps the original shelf interactions.
export const records: ArchiveRecord[] = careerRoadmapMonths.map((month, index) => {
  return { id: month.id, title: month.action, en: month.label,
    department: month.phase, category: archiveColumns[Math.floor(index / 3)],
    date: "月份：待填写", lead: "贡献边界：待填写", clearance: "DRAFT",
    abstract: month.summary, findings: [month.deliverable, month.acceptance],
    source: "待填写" };
});

export function columnFiles(lane: number) {
  return records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => record.category === archiveColumns[lane])
    .map(({ index }) => index);
}
export function fileLocation(index: number) {
  const lane = archiveColumns.indexOf(records[index].category);
  const row = 12 + columnFiles(lane).indexOf(index);
  return { lane, row, slot: lane * 32 + row };
}
export function fileAtSlot(slot: number) {
  const files = columnFiles(Math.floor(slot / 32));
  return files[Math.max(0, Math.min(files.length - 1, (slot % 32) - 12))];
}
