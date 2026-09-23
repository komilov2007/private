"use client";
import ThemeProvider from "./theme-provider";
import CallProvider from "@/components/calls/call-provider";
import type { UserIdentity } from "@/lib/identity";
export default function AuthenticatedApp({userId,identity,children}:{userId:string;identity:UserIdentity;children:React.ReactNode}){return <ThemeProvider identity={identity}><CallProvider userId={userId}>{children}</CallProvider></ThemeProvider>}
