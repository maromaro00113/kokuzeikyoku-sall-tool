import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const logPath = path.join(process.cwd(), 'data', 'logs.json');
    const data = await fs.readFile(logPath, 'utf8');
    return NextResponse.json(JSON.parse(data));
  } catch (e) {
    // ファイルが存在しない、またはパースエラーの場合は空配列を返す
    return NextResponse.json([]);
  }
}
