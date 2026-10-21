// Placeholder while a lazily-loaded history chunk downloads (same look as the
// empty state in ScanHistoryView).
export default function ScanHistoryLoading() {
  return (
    <div className="py-16 text-center">
      <p className="text-label text-white/30">กำลังโหลดข้อมูลย้อนหลัง...</p>
    </div>
  );
}
