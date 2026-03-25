import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    version: "V-SYNC-AUDIT-02",
    timestamp: new Date().toISOString(),
    status: "active",
    commit: "02e179e-diag"
  });
}
