import { Download, X } from "lucide-react";

type Viewer = { src: string; name: string; type: "image" | "video" } | null;

export default function MediaViewer({ viewer, onClose }: { viewer: Viewer; onClose: () => void }) {
  if (!viewer) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/92 p-4 text-white">
      <div className="flex justify-end gap-2">
        <a href={viewer.src} download={viewer.name} aria-label="Yuklab olish" className="grid h-11 w-11 place-items-center rounded-full bg-white/12"><Download /></a>
        <button onClick={onClose} aria-label="Yopish" className="grid h-11 w-11 place-items-center rounded-full bg-white/12"><X /></button>
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto">
        {viewer.type === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={viewer.src} alt={viewer.name} className="max-h-full max-w-full object-contain" />
        ) : (
          <video src={viewer.src} controls playsInline className="max-h-full max-w-full" />
        )}
      </div>
    </div>
  );
}
