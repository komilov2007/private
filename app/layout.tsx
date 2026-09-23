import type { Metadata, Viewport } from "next";
import "./globals.css";
import DevServiceWorkerReset from "@/components/app/dev-service-worker-reset";
import NativeShell from "@/components/app/native-shell";

export const metadata: Metadata = {
  title: "Rahmatulloh va Nilufar",
  description: "Shaxsiy messenjer",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Messenger",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  themeColor: "#fffaf8",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `try{var d=document.documentElement;var i=localStorage.getItem('last-identity')||'rahmatulloh';var p=localStorage.getItem('private-messenger-theme:'+i)||'system';var t=p==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;d.dataset.identity=i;d.dataset.theme=t;d.style.colorScheme=t}catch(e){}` }} /></head>
      <body>{children}<DevServiceWorkerReset /><NativeShell /></body>
    </html>
  );
}
