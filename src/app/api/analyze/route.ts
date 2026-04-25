import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export const maxDuration = 300;
export const runtime = 'nodejs';

const groqApiKey = process.env.GROQ_API_KEY;
const ntaAppCode = process.env.NTA_APPLICATION_CODE;

async function callGroq(prompt: string, maxTokens = 1500): Promise<string> {
  if (!groqApiKey) throw new Error('Groq APIキーが未設定です');
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqApiKey}` },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'あなたは優秀な日本の営業コンサルタントです。必ずJSON形式のみで返答してください。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.6,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? '';
}

// 都道府県コード（国税庁 法人番号API用）
const PREF_CODES: Record<string, string> = {
  '北海道':'01','青森県':'02','岩手県':'03','宮城県':'04','秋田県':'05','山形県':'06','福島県':'07',
  '茨城県':'08','栃木県':'09','群馬県':'10','埼玉県':'11','千葉県':'12','東京都':'13','神奈川県':'14',
  '新潟県':'15','富山県':'16','石川県':'17','福井県':'18','山梨県':'19','長野県':'20',
  '岐阜県':'21','静岡県':'22','愛知県':'23','三重県':'24','滋賀県':'25','京都府':'26',
  '大阪府':'27','兵庫県':'28','奈良県':'29','和歌山県':'30','鳥取県':'31','島根県':'32',
  '岡山県':'33','広島県':'34','山口県':'35','徳島県':'36','香川県':'37','愛媛県':'38','高知県':'39',
  '福岡県':'40','佐賀県':'41','長崎県':'42','熊本県':'43','大分県':'44','宮崎県':'45','鹿児島県':'46','沖縄県':'47',
};

const PREFECTURES = Object.keys(PREF_CODES);

export async function POST(req: Request) {
  console.log('=== POST /api/analyze START ===');
  try {
    let body: any;
    try { body = await req.json(); }
    catch { return NextResponse.json({ error: 'リクエストの解析に失敗しました' }, { status: 400 }); }

    const products: string[] = body?.products ?? [];
    const targetPrefectures: string[] = body?.prefectures ?? [];
    const targetCity: string = (body?.city ?? '').trim();
    if (products.length === 0) return NextResponse.json({ error: '商品が入力されていません' }, { status: 400 });

    const productList = products.map((p, i) => `商品${i + 1}: ${p}`).join('\n');
    let searchKeyword = 'サービス';
    let advice = '商品の強みを活かした営業に取り組んでください。';
    let estimatedSalesCount = 0;
    let estimatedRatio = 0;
    let marketComment = '';

    // ━━━━ STEP 1: Groq → キーワード・アドバイス・市場規模予測（1回） ━━━━
    if (groqApiKey) {
      try {
        console.log('[Groq] Step1: keyword + advice + market estimate');
        const raw = await callGroq(`
自社商品リスト:
${productList}

対象地域: ${targetPrefectures.length > 0 ? targetPrefectures.join('・') : '全国'}${targetCity ? ' ' + targetCity : ''}

以下のJSONのみで返答してください:
{
  "searchKeyword": "国税庁法人番号APIで検索する会社名キーワード（1〜2語、業種・業態を表す一般的な名称）",
  "advice": "①ターゲット企業の特徴 ②具体的営業アプローチ ③各商品の改善提案 を含む500文字のアドバイス",
  "estimatedMatchRatio": 0〜100の整数（この商品群が対象地域の企業に刺さる確率%。厳しめに見積もること）,
  "marketComment": "この市場規模と営業可能性についての一言コメント（100文字以内）"
}`, 1500);
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) {
          const p = JSON.parse(m[0]);
          if (p.searchKeyword) searchKeyword = p.searchKeyword;
          if (p.advice) advice = p.advice;
          if (p.estimatedMatchRatio) estimatedRatio = Number(p.estimatedMatchRatio) || 0;
          if (p.marketComment) marketComment = p.marketComment;
        }
        console.log('[Groq] keyword:', searchKeyword, '| ratio:', estimatedRatio);
      } catch (e: any) { console.error('[Groq] Step1 error:', e?.message); }
    }

    // ━━━━ STEP 2: 国税庁 法人番号API（1回だけ） ━━━━
    let rawCompanies: any[] = [];
    let ntaTotalCount = 0;
    let ntaStatus = '';

    if (!ntaAppCode) {
      ntaStatus = 'NTA_APPLICATION_CODE が未設定です。.env.local に設定してください。';
      console.warn('[NTA] API code not set');
    } else {
      try {
        const prefCode = PREF_CODES[targetPrefectures[0]] ?? '';
        const params = new URLSearchParams({
          name: searchKeyword,
          ...(prefCode ? { address: prefCode } : {}),
          kind: '03',   // 設立登記をした法人（03=一般企業のみ）
          change: '0',
          close: '0',   // 廃業を除外
          divide: '1',  // 1ページ目のみ（大量呼び出し防止）
          type: '12',   // JSON形式
          applicationCode: ntaAppCode,
        });
        const url = `https://api.houjin-bangou.nta.go.jp/4/name?${params}`;
        console.log('[NTA] API call:', url);

        const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
        if (!res.ok) throw new Error(`NTA HTTP ${res.status}`);

        const data = await res.json();
        ntaTotalCount = Number(data.count) || 0;
        const corporations: any[] = data.corporations ?? [];

        // 市区町村フィルター（指定がある場合）
        const filtered = targetCity
          ? corporations.filter((c: any) => (c.cityName ?? '').includes(targetCity) || (c.streetNumber ?? '').includes(targetCity))
          : corporations;

        rawCompanies = filtered.slice(0, 100); // 最大100社
        ntaStatus = `国税庁APIから ${ntaTotalCount.toLocaleString()} 件中 ${rawCompanies.length} 社を取得`;
        console.log('[NTA]', ntaStatus);
      } catch (e: any) {
        ntaStatus = `国税庁API エラー: ${e?.message}`;
        console.error('[NTA]', e?.message);
      }
    }

    // 母集団数 → 推定営業可能数 を計算
    estimatedSalesCount = ntaTotalCount > 0
      ? Math.round(ntaTotalCount * (estimatedRatio / 100))
      : 0;

    // ━━━━ STEP 3: Groq → 取得した実在企業をスコアリング ━━━━
    interface Score {
      matchScore: number; matchLevel: string;
      bestMatchProductIndex: number; productTip: string;
      negotiationStrategy: string;
      predictedNeeds: string[]; isActive: boolean;
    }
    const scoreMap: Record<number, Score> = {};

    if (groqApiKey && rawCompanies.length > 0) {
      // 商品の価格帯サマリーをGroq用に構築
      const productPricingInfo = products.map((p: any, i: number) => {
        const tierLabel = p.priceTier === 'A' ? '高単価' : p.priceTier === 'B' ? '中単価' : '低単価';
        const priceStr = p.targetPrice ? `目標${p.pricingType}${Number(String(p.targetPrice).replace(/,/g, '')).toLocaleString()}円` : '価格未設定';
        return `商品${i + 1}（${tierLabel}・${priceStr}）: ${typeof p === 'string' ? p : p.description}`;
      }).join('\n');

      const batchSize = 15;
      for (let b = 0; b < rawCompanies.length; b += batchSize) {
        const batch = rawCompanies.slice(b, b + batchSize);
        const listStr = batch.map((c: any, i: number) =>
          `${i + 1}. ${c.name}（${c.prefectureName ?? ''}${c.cityName ?? ''}）`
        ).join('\n');
        try {
          console.log(`[Groq] Scoring batch ${Math.floor(b / batchSize) + 1}...`);
          const raw = await callGroq(`
【自社商品と価格帯】
${productPricingInfo}

【実在企業リスト（国税庁データ）】
${listStr}

各企業へのマッチ度と1回目交渉戦略をJSON配列で返答（リスト順・${batch.length}社分）:
[{"matchScore":80,"matchLevel":"High (80%)","bestMatchProductIndex":1,"productTip":"matchScore80以上のみ具体的なアプローチ、未満は空文字","negotiationStrategy":"1回目の交渉では商品X（価格帯Y）を提案し、まずOO円を目標に話を進めましょう。相手企業のOO部門に刺さる提案が効果的です。","predictedNeeds":["需要1","需要2","需要3","需要4","需要5","需要6"],"isActive":true}]
※matchScoreは20〜99。isActiveは97%true。negotiationStrategyは全社に必ず記入。${batch.length}社分返すこと。`,
            Math.min(5000, batch.length * 320)
          );
          const m = raw.match(/\[[\s\S]*\]/);
          if (m) {
            const scores: Score[] = JSON.parse(m[0]);
            batch.forEach((_: any, i: number) => { if (scores[i]) scoreMap[b + i] = scores[i]; });
          }
        } catch (e: any) { console.error(`[Groq] Batch ${b} error:`, e?.message); }
      }
    }

    // ━━━━ STEP 4: データ組み立て ━━━━
    const companies = rawCompanies.map((c: any, i: number) => {
      const sc = scoreMap[i];
      const pref = c.prefectureName ?? '';
      const city = c.cityName ?? '';
      const street = c.streetNumber ?? '';
      return {
        corporateNumber: c.corporateNumber ?? '',
        name: c.name ?? '',
        prefecture: pref,
        city,
        address: `${pref}${city}${street}`,
        phone: '（公式サイトより要確認）',
        email: '（公式サイトより要確認）',
        website: `https://www.google.com/search?q=${encodeURIComponent(c.name ?? '')}+公式サイト`,
        contactPerson: '担当者（要確認）',
        isActive: sc?.isActive !== false,
        matchScore: sc?.matchScore ?? 55,
        matchLevel: sc?.matchLevel ?? 'Medium',
        bestMatchProductIndex: sc?.bestMatchProductIndex ?? 1,
        productTip: sc?.productTip ?? '',
        negotiationStrategy: sc?.negotiationStrategy ?? '',
        predictedNeeds: sc?.predictedNeeds ?? ['DX推進', 'コスト削減', '採用強化', '業務自動化', '営業支援', '社内教育'],
      };
    });

    companies.sort((a, b) => b.matchScore - a.matchScore);

    // 都道府県別集計（取得企業ベース）
    const prefectureStats: Record<string, number> = {};
    for (const p of PREFECTURES) {
      prefectureStats[p] = companies.filter(c => c.prefecture === p && c.matchScore >= 60).length;
    }

    const result = {
      companies,
      advice,
      prefectureStats,
      products,
      marketData: {
        ntaTotalCount,          // NTA母集団（検索条件にマッチする全法人数）
        fetchedCount: companies.length,  // 今回取得した企業数
        estimatedRatio,         // AI予測マッチ率（%）
        estimatedSalesCount,    // 推定営業可能数
        marketComment,
        ntaStatus,
        searchKeyword,
      },
    };

    console.log(`=== SUCCESS: ${companies.length} companies, NTA total: ${ntaTotalCount} ===`);

    // ログの保存処理
    try {
      const logPath = path.join(process.cwd(), 'data', 'logs.json');
      await fs.mkdir(path.dirname(logPath), { recursive: true });
      let logs = [];
      try {
        const fileData = await fs.readFile(logPath, 'utf8');
        logs = JSON.parse(fileData);
      } catch (e) {}

      const newLog = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        searchKeyword, // 取得名（キーワード）
        targetCity: targetCity || '指定なし', // 取得場所
        targetPrefectures: targetPrefectures.length > 0 ? targetPrefectures.join('・') : '全国', // 取得地域
        products: products.map((p: any) => p.description).join(' / '), // どんな営業商品で調べたか
        fetchedCount: companies.length,
      };

      logs.unshift(newLog);
      await fs.writeFile(logPath, JSON.stringify(logs, null, 2));
      console.log('[LOG] Saved search log successfully');
    } catch (logErr: any) {
      console.error('[LOG] Failed to save search log', logErr?.message);
    }

    return NextResponse.json(result);

  } catch (fatal: any) {
    console.error('FATAL:', fatal?.message);
    return NextResponse.json({ error: `サーバーエラー: ${fatal?.message}` }, { status: 500 });
  }
}
