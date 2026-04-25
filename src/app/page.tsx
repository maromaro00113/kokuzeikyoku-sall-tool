'use client';

import { useState, useMemo } from 'react';
import { Search, Activity, Download, MapPin, TrendingUp, Building, BarChart2, ChevronDown, ChevronUp, Lightbulb, CheckCircle, AlertCircle, Filter, Tag } from 'lucide-react';

const PREFECTURES = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];

const TIER_CONFIG = {
  A: { label: 'A：高単価', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', border: 'rgba(245,158,11,0.4)' },
  B: { label: 'B：中単価', color: '#6366f1', bg: 'rgba(99,102,241,0.15)', border: 'rgba(99,102,241,0.4)' },
  C: { label: 'C：低単価', color: '#10b981', bg: 'rgba(16,185,129,0.15)', border: 'rgba(16,185,129,0.4)' },
} as const;

const PRICING_TYPES = ['単価', '時給', '月額', '年間契約'] as const;

interface ProductConfig {
  description: string;
  priceTier: 'A' | 'B' | 'C';
  pricingType: typeof PRICING_TYPES[number];
  targetPrice: string; // 文字列で管理（コンマ入力対応）
}

interface Company {
  corporateNumber: string;
  name: string;
  prefecture: string;
  city: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  isActive: boolean;
  matchScore: number;
  matchLevel: string;
  bestMatchProductIndex: number;
  productTip: string;
  negotiationStrategy: string; // 1回目交渉戦略
  predictedNeeds: string[];
}

interface SearchLog {
  id: string;
  date: string;
  searchKeyword: string;
  targetCity: string;
  targetPrefectures: string;
  products: string;
  fetchedCount: number;
}

interface MarketData {
  ntaTotalCount: number;
  fetchedCount: number;
  estimatedRatio: number;
  estimatedSalesCount: number;
  marketComment: string;
  ntaStatus: string;
  searchKeyword: string;
}

interface AnalysisResult {
  companies: Company[];
  advice: string;
  prefectureStats: Record<string, number>;
  products: ProductConfig[];
  marketData: MarketData;
}

const defaultProduct = (): ProductConfig => ({ description: '', priceTier: 'B', pricingType: '単価', targetPrice: '' });

export default function Home() {
  const [products, setProducts] = useState<ProductConfig[]>([defaultProduct()]);
  const [selectedPrefectures, setSelectedPrefectures] = useState<string[]>([]);
  const [targetCity, setTargetCity] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const [searchText, setSearchText] = useState('');
  const [showLogs, setShowLogs] = useState(false);
  const [logsList, setLogsList] = useState<SearchLog[]>([]);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        setLogsList(await res.json());
      }
    } catch (e) {
      console.error(e);
    }
  };
  const [filterMatch, setFilterMatch] = useState<'all' | 'high' | 'mid' | 'low'>('all');
  const [filterPref, setFilterPref] = useState('all');
  const [filterActive, setFilterActive] = useState<'all' | 'active' | 'risk'>('all');
  const [sortBy, setSortBy] = useState<'match' | 'name' | 'pref'>('match');
  const [prefOpen, setPrefOpen] = useState(false);

  const updateProduct = (i: number, field: keyof ProductConfig, value: string) => {
    const n = [...products];
    (n[i] as any)[field] = value;
    setProducts(n);
  };

  const submitAnalysis = async () => {
    const filtered = products.filter(p => p.description.trim() !== '');
    if (filtered.length === 0) { alert('商品を入力してください'); return; }
    setIsLoading(true); setResult(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: filtered, prefectures: selectedPrefectures, city: targetCity.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(data);
        setSearchText(''); setFilterMatch('all'); setFilterPref('all'); setFilterActive('all'); setSortBy('match');
      } else { alert('エラー: ' + data.error); }
    } catch (e) { console.error(e); alert('通信エラーが発生しました'); }
    setIsLoading(false);
  };

  const displayedCompanies = useMemo(() => {
    if (!result) return [];
    return result.companies
      .filter(c => {
        if (searchText && !c.name.includes(searchText) && !c.address.includes(searchText) && !c.city.includes(searchText)) return false;
        if (filterMatch === 'high' && c.matchScore < 80) return false;
        if (filterMatch === 'mid' && (c.matchScore < 60 || c.matchScore >= 80)) return false;
        if (filterMatch === 'low' && c.matchScore >= 60) return false;
        if (filterPref !== 'all' && c.prefecture !== filterPref) return false;
        if (filterActive === 'active' && !c.isActive) return false;
        if (filterActive === 'risk' && c.isActive) return false;
        return true;
      })
      .sort((a, b) => sortBy === 'match' ? b.matchScore - a.matchScore : sortBy === 'name' ? a.name.localeCompare(b.name, 'ja') : a.prefecture.localeCompare(b.prefecture, 'ja'));
  }, [result, searchText, filterMatch, filterPref, filterActive, sortBy]);

  // 商品サマリーテキスト（CSV・テーブル表示用）
  const productSummary = (p: ProductConfig) => {
    const tier = TIER_CONFIG[p.priceTier];
    const price = p.targetPrice ? `${Number(p.targetPrice.replace(/,/g, '')).toLocaleString()}円` : '未設定';
    return `[${tier.label}] ${p.pricingType}${price}`;
  };

  const downloadCsv = (useFilter = false) => {
    if (!result) return;
    const data = useFilter ? displayedCompanies : result.companies;

    // 商品情報ヘッダー
    const productHeaders = result.products.flatMap((p, i) => [`商品${i + 1}説明`, `商品${i + 1}価格帯`, `商品${i + 1}${p.pricingType}目標額`]);
    const header = ['#', '法人番号', '会社名', '都道府県', '市区町村', '住所', '電話番号', 'メールアドレス', '公式サイト検索', '状態', 'マッチ度(%)', 'マッチレベル', '相性商品', '🎯1回目交渉戦略', '予測需要（6選）', ...productHeaders];

    const rows = data.map((c, i) => {
      const matchedProduct = result.products[c.bestMatchProductIndex - 1];
      const productCols = result.products.flatMap(p => [p.description.slice(0, 50), TIER_CONFIG[p.priceTier].label, p.targetPrice ? `${p.targetPrice}円（${p.pricingType}）` : '未設定']);
      return [
        i + 1, c.corporateNumber, c.name, c.prefecture, c.city, c.address,
        c.phone, c.email, c.website,
        c.isActive ? '活動中' : '要注意',
        c.matchScore, c.matchLevel,
        matchedProduct ? `商品${c.bestMatchProductIndex}（${TIER_CONFIG[matchedProduct.priceTier].label}）` : '',
        c.negotiationStrategy || c.productTip || '',
        c.predictedNeeds.join(' / '),
        ...productCols,
      ];
    });

    const csv = [header, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `営業リスト_${new Date().toLocaleDateString('ja-JP').replace(/\//g, '')}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const md = result?.marketData;

  return (
    <main className="container">
      <div className="header animate-fade-in" style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '1rem' }}>
        <div>
          <h1 className="title">AI Sales Intelligence</h1>
          <p className="subtitle">国税庁法人データ × AI分析で、実在企業への最適な営業戦略を導き出す</p>
        </div>
        <button className="btn btn-secondary" onClick={() => { setShowLogs(true); fetchLogs(); }} style={{ fontSize: '0.85rem' }}>
          <Activity size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />検索履歴を見る
        </button>
      </div>

      {/* ━━━━ 検索履歴モーダル ━━━━ */}
      {showLogs && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '1rem' }} onClick={() => setShowLogs(false)}>
          <div style={{ background: 'var(--panel-bg)', border: '1px solid var(--panel-border)', borderRadius: '12px', width: '100%', maxWidth: '1000px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '1.2rem', borderBottom: '1px solid var(--panel-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: '1.2rem' }}>過去の検索履歴（国税庁API利用）</h2>
              <button className="btn" onClick={() => setShowLogs(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.5rem', padding: 0 }}>×</button>
            </div>
            <div style={{ overflowY: 'auto', padding: '1.2rem', flex: 1 }}>
              {logsList.length === 0 ? (
                <p style={{ textAlign: 'center', color: 'var(--text-muted)' }}>ログはまだありません。</p>
              ) : (
                <table className="data-table" style={{ width: '100%', fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th style={{ whiteSpace: 'nowrap' }}>取得日時</th>
                      <th style={{ whiteSpace: 'nowrap' }}>取得名(キーワード)</th>
                      <th style={{ whiteSpace: 'nowrap' }}>対象地域</th>
                      <th style={{ whiteSpace: 'nowrap' }}>取得場所(市区町村)</th>
                      <th>検索に使用した商品・サービス</th>
                      <th style={{ whiteSpace: 'nowrap', textAlign: 'center' }}>取得社数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logsList.map((log) => (
                      <tr key={log.id}>
                        <td style={{ color: 'var(--text-muted)' }}>{new Date(log.date).toLocaleString('ja-JP')}</td>
                        <td style={{ fontWeight: '600' }}>{log.searchKeyword}</td>
                        <td>{log.targetPrefectures}</td>
                        <td>{log.targetCity}</td>
                        <td style={{ minWidth: '250px' }}>{log.products}</td>
                        <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{log.fetchedCount}社</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ━━━━ 入力フォーム ━━━━ */}
      {!result && (
        <div className="glass-panel animate-fade-in" style={{ padding: '2rem', maxWidth: '900px', margin: '0 auto' }}>
          <h2 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity color="var(--primary)" size={22} /> 自社商品の入力
          </h2>
          <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            最大5つまで商品・サービスを入力し、価格帯と目標単価を設定してください
          </p>

          {products.map((p, i) => {
            const tier = TIER_CONFIG[p.priceTier];
            return (
              <div key={i} className="input-group" style={{ border: `1px solid ${tier.border}`, borderRadius: '12px', padding: '1.2rem', background: tier.bg, marginBottom: '1.2rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <label style={{ fontWeight: '700', fontSize: '0.95rem', color: tier.color }}>
                    <Tag size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '5px' }} />
                    商品・サービス {i + 1}
                  </label>
                  {products.length > 1 && (
                    <button onClick={() => setProducts(products.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.82rem' }}>削除</button>
                  )}
                </div>

                {/* 商品説明 */}
                <textarea className="input-field" rows={3}
                  placeholder="例：中小企業向けクラウド勤怠管理システム。月額3,000円〜。使いやすさと低コストが強み..."
                  value={p.description}
                  onChange={e => { if (e.target.value.length <= 400) updateProduct(i, 'description', e.target.value); }}
                  style={{ marginBottom: '0.75rem' }} />
                <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '-0.5rem', marginBottom: '0.75rem' }}>{p.description.length} / 400</div>

                {/* 価格設定 */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  {/* 価格帯ランク */}
                  <div style={{ flex: '0 0 auto' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>価格帯ランク</div>
                    <div style={{ display: 'flex', gap: '0.4rem' }}>
                      {(['A', 'B', 'C'] as const).map(t => {
                        const tc = TIER_CONFIG[t];
                        return (
                          <button key={t} onClick={() => updateProduct(i, 'priceTier', t)} style={{
                            padding: '0.35rem 0.75rem', borderRadius: '7px', fontSize: '0.82rem', cursor: 'pointer', fontWeight: '700',
                            border: `1.5px solid ${p.priceTier === t ? tc.color : 'var(--panel-border)'}`,
                            background: p.priceTier === t ? tc.bg : 'transparent',
                            color: p.priceTier === t ? tc.color : 'var(--text-muted)',
                          }}>{tc.label}</button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 料金タイプ */}
                  <div style={{ flex: '0 0 auto' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>課金タイプ</div>
                    <select value={p.pricingType} onChange={e => updateProduct(i, 'pricingType', e.target.value)}
                      style={{ background: 'rgba(15,23,42,0.8)', color: 'var(--text-main)', border: '1px solid var(--panel-border)', borderRadius: '7px', padding: '0.35rem 0.7rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                      {PRICING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  {/* 目標金額 */}
                  <div style={{ flex: '1', minWidth: '150px' }}>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                      1回目交渉の目標 {p.pricingType}（円）
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <input type="text" value={p.targetPrice}
                        onChange={e => updateProduct(i, 'targetPrice', e.target.value.replace(/[^\d,]/g, ''))}
                        placeholder="例：50000"
                        style={{ width: '100%', background: 'rgba(15,23,42,0.8)', color: 'var(--text-main)', border: `1.5px solid ${tier.border}`, borderRadius: '7px', padding: '0.38rem 0.75rem', fontSize: '0.9rem', outline: 'none' }} />
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>円</span>
                    </div>
                  </div>
                </div>

                {/* 価格サマリー */}
                {p.targetPrice && (
                  <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '7px', fontSize: '0.82rem', color: tier.color }}>
                    💡 1回目交渉目標：<strong>{p.pricingType} {Number(p.targetPrice.replace(/,/g, '')).toLocaleString()}円</strong>
                    をまず提示し、その後条件交渉に進みましょう
                  </div>
                )}
              </div>
            );
          })}

          {products.length < 5 && (
            <button className="btn btn-secondary" onClick={() => setProducts([...products, defaultProduct()])} style={{ marginBottom: '1.5rem', fontSize: '0.85rem' }}>
              + 商品を追加
            </button>
          )}

          {/* 市区町村 */}
          <div className="input-group" style={{ marginBottom: '1rem' }}>
            <label className="input-label">市区町村で絞り込み（任意）</label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <input type="text" className="input-field" style={{ height: '2.7rem', padding: '0 1rem' }}
                placeholder="例：渋谷区、名古屋市、大阪市北区"
                value={targetCity} onChange={e => setTargetCity(e.target.value)} />
              {targetCity && <button onClick={() => setTargetCity('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.82rem', whiteSpace: 'nowrap' }}>クリア</button>}
            </div>
          </div>

          {/* 都道府県 */}
          <div style={{ marginBottom: '1.5rem' }}>
            <button onClick={() => setPrefOpen(!prefOpen)} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
              color: 'var(--text-main)', borderRadius: '8px', padding: '0.6rem 1rem', cursor: 'pointer', fontSize: '0.9rem'
            }}>
              <span><MapPin size={14} style={{ verticalAlign: 'middle', marginRight: '6px' }} />
                対象都道府県を選択 {selectedPrefectures.length > 0 ? `（${selectedPrefectures.length}件選択中）` : '（デフォルト：全国）'}
              </span>
              {prefOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>
            {prefOpen && (
              <div style={{ marginTop: '0.75rem', padding: '1rem', background: 'rgba(15,23,42,0.5)', borderRadius: '8px', border: '1px solid var(--panel-border)' }}>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem' }} onClick={() => setSelectedPrefectures([...PREFECTURES])}>全選択</button>
                  <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '0.3rem 0.7rem' }} onClick={() => setSelectedPrefectures([])}>全解除</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.35rem' }}>
                  {PREFECTURES.map(pref => (
                    <label key={pref} style={{
                      display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '0.82rem',
                      padding: '0.28rem 0.5rem', borderRadius: '6px', transition: 'all 0.15s',
                      background: selectedPrefectures.includes(pref) ? 'rgba(99,102,241,0.25)' : 'transparent',
                      border: selectedPrefectures.includes(pref) ? '1px solid var(--primary)' : '1px solid transparent',
                    }}>
                      <input type="checkbox" checked={selectedPrefectures.includes(pref)}
                        onChange={() => setSelectedPrefectures(prev => prev.includes(pref) ? prev.filter(p => p !== pref) : [...prev, pref])}
                        style={{ accentColor: 'var(--primary)' }} />
                      {pref}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <button className="btn btn-primary" onClick={submitAnalysis} disabled={isLoading} style={{ width: '100%', padding: '0.9rem', fontSize: '1rem' }}>
            {isLoading ? 'AI分析・企業データ取得中...' : <><Search size={18} style={{ verticalAlign: 'middle', marginRight: '8px' }} />分析を実行</>}
          </button>

          <div style={{ marginTop: '1.2rem', padding: '0.85rem', background: 'rgba(99,102,241,0.07)', borderRadius: '8px', border: '1px solid rgba(99,102,241,0.2)', fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: '1.7' }}>
            📋 国税庁 法人番号APIのアプリケーションIDが必要です。<br />
            取得先：<a href="https://www.houjin-bangou.nta.go.jp/webapi/" target="_blank" rel="noreferrer" style={{ color: 'var(--primary)' }}>https://www.houjin-bangou.nta.go.jp/webapi/</a><br />
            取得後 .env.local に <code>NTA_APPLICATION_CODE=取得したID</code> を追記してください。
          </div>
        </div>
      )}

      {isLoading && !result && (
        <div style={{ textAlign: 'center', marginTop: '5rem' }} className="animate-fade-in">
          <div style={{ display: 'inline-block', width: '60px', height: '60px', border: '3px solid var(--panel-border)', borderTopColor: 'var(--primary)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ marginTop: '1.5rem', color: 'var(--text-muted)', fontSize: '1rem' }}>国税庁データを取得中... AIが企業をスコアリングしています...</p>
          <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ━━━━ 分析結果 ━━━━ */}
      {result && (
        <div className="animate-fade-in">
          {/* ヘッダー */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <h2 style={{ margin: 0 }}>分析結果</h2>
              {md?.ntaStatus && <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>ℹ️ {md.ntaStatus}</p>}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              <button className="btn btn-secondary" onClick={() => downloadCsv(false)} style={{ padding: '0.5rem 1rem', fontSize: '0.88rem' }}>
                <Download size={14} style={{ verticalAlign: 'middle', marginRight: '5px' }} />全件CSV
              </button>
              <button className="btn btn-primary" onClick={() => downloadCsv(true)} style={{ padding: '0.5rem 1rem', fontSize: '0.88rem' }}>
                <Download size={14} style={{ verticalAlign: 'middle', marginRight: '5px' }} />フィルター結果CSV
              </button>
              <button className="btn btn-secondary" onClick={() => setResult(null)} style={{ fontSize: '0.88rem' }}>再検索</button>
            </div>
          </div>

          {/* 登録商品サマリー */}
          <div className="glass-panel" style={{ padding: '1.2rem', marginBottom: '1.5rem' }}>
            <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>📦 登録商品一覧</h3>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
              {result.products.map((p, i) => {
                const tier = TIER_CONFIG[p.priceTier];
                return (
                  <div key={i} style={{ padding: '0.6rem 1rem', borderRadius: '10px', background: tier.bg, border: `1px solid ${tier.border}`, fontSize: '0.85rem' }}>
                    <span style={{ color: tier.color, fontWeight: '700' }}>商品{i + 1}（{tier.label}）</span>
                    {p.targetPrice && <span style={{ marginLeft: '8px', color: 'var(--text-muted)' }}>{p.pricingType} {Number(p.targetPrice.replace(/,/g, '')).toLocaleString()}円</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* マーケットダッシュボード */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(175px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            {[
              { icon: <Building size={20} color="#6366f1" />, label: 'CSV母集団数', value: `${(md?.ntaTotalCount ?? 0).toLocaleString()}社`, sub: '国税庁API 検索件数', color: '#6366f1' },
              { icon: <TrendingUp size={20} color="#10b981" />, label: '推定営業可能数', value: `${(md?.estimatedSalesCount ?? 0).toLocaleString()}社`, sub: `AI予測マッチ率 ${md?.estimatedRatio ?? 0}%`, color: '#10b981' },
              { icon: <BarChart2 size={20} color="#f59e0b" />, label: '取得企業数（今回）', value: `${(md?.fetchedCount ?? 0).toLocaleString()}社`, sub: 'スコアリング済み', color: '#f59e0b' },
              { icon: <Search size={20} color="#a855f7" />, label: '高マッチ企業数', value: `${result.companies.filter(c => c.matchScore >= 80).length}社`, sub: 'マッチ度80%以上', color: '#a855f7' },
            ].map((card, i) => (
              <div key={i} className="glass-panel" style={{ padding: '1.2rem', textAlign: 'center' }}>
                <div style={{ marginBottom: '0.4rem' }}>{card.icon}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>{card.label}</div>
                <div style={{ fontSize: '1.45rem', fontWeight: '800', color: card.color }}>{card.value}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{card.sub}</div>
              </div>
            ))}
          </div>

          {md?.marketComment && (
            <div style={{ marginBottom: '1.5rem', padding: '1rem 1.2rem', background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.25)', borderRadius: '10px', fontSize: '0.9rem', color: '#6ee7b7' }}>
              <TrendingUp size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '6px' }} />
              {md.marketComment}
            </div>
          )}

          {/* AI アドバイス */}
          <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '2rem' }}>
            <h3 style={{ marginBottom: '0.75rem', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem' }}>
              <Activity size={18} /> AI 営業コンサルティング
            </h3>
            <div style={{ lineHeight: '1.9', whiteSpace: 'pre-wrap', fontSize: '0.92rem' }}>{result.advice}</div>
          </div>

          {/* フィルターバー */}
          <div className="glass-panel" style={{ padding: '1rem 1.2rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
              <Filter size={14} color="var(--text-muted)" />
              <div style={{ position: 'relative', flex: '1', minWidth: '160px' }}>
                <Search size={12} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
                  placeholder="会社名・住所で検索..."
                  style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--panel-border)', borderRadius: '7px', padding: '0.4rem 0.75rem 0.4rem 2rem', color: 'var(--text-main)', fontSize: '0.85rem', outline: 'none' }} />
              </div>
              {[
                { key: 'filterMatch', val: filterMatch, set: setFilterMatch, opts: [['all','全マッチ度'],['high','高（80%以上）'],['mid','中（60〜79%）'],['low','低（60%未満）']] },
                { key: 'filterPref', val: filterPref, set: setFilterPref, opts: [['all','全都道府県'], ...PREFECTURES.map(p => [p, p])] },
                { key: 'filterActive', val: filterActive, set: setFilterActive, opts: [['all','全状態'],['active','活動中のみ'],['risk','要注意のみ']] },
                { key: 'sortBy', val: sortBy, set: setSortBy, opts: [['match','マッチ度順'],['name','会社名順'],['pref','都道府県順']] },
              ].map(({ key, val, set, opts }) => (
                <select key={key} value={val} onChange={e => (set as any)(e.target.value)}
                  style={{ background: 'rgba(15,23,42,0.8)', color: 'var(--text-main)', border: '1px solid var(--panel-border)', borderRadius: '7px', padding: '0.4rem 0.7rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                  {opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ))}
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{displayedCompanies.length}社表示</span>
            </div>
          </div>

          {/* 企業テーブル */}
          {displayedCompanies.length === 0 ? (
            <div className="glass-panel" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p>条件に一致する企業が見つかりませんでした</p>
            </div>
          ) : (
            <div className="glass-panel" style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: '2.2rem', textAlign: 'center' }}>#</th>
                    <th>企業情報</th>
                    <th>住所・連絡先</th>
                    <th style={{ whiteSpace: 'nowrap' }}>状態</th>
                    <th style={{ whiteSpace: 'nowrap' }}>マッチ度</th>
                    <th>🎯 1回目交渉戦略</th>
                    <th>予測需要（6選）</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedCompanies.map((c, idx) => {
                    const isHigh = c.matchScore >= 80;
                    const scoreColor = c.matchScore >= 80 ? 'var(--success)' : c.matchScore >= 60 ? '#fbbf24' : 'var(--text-muted)';
                    const matchedProduct = result.products[c.bestMatchProductIndex - 1];
                    const tierConfig = matchedProduct ? TIER_CONFIG[matchedProduct.priceTier] : null;
                    return (
                      <tr key={idx} style={{ borderLeft: isHigh ? '3px solid var(--success)' : '3px solid transparent' }}>
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: '600', fontSize: '0.82rem' }}>{idx + 1}</td>
                        <td>
                          <div style={{ fontWeight: '700', marginBottom: '3px' }}>{c.name}</div>
                          {c.corporateNumber && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '3px' }}>法人番号: {c.corporateNumber}</div>}
                          <a href={c.website} target="_blank" rel="noreferrer" style={{ fontSize: '0.78rem', color: 'var(--primary)', textDecoration: 'none' }}>🔍 公式サイトを検索</a>
                          {isHigh && c.productTip && (
                            <div style={{ marginTop: '7px', padding: '6px 9px', borderRadius: '7px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', fontSize: '0.78rem', color: '#6ee7b7', lineHeight: '1.5' }}>
                              <Lightbulb size={11} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                              <strong>商品{c.bestMatchProductIndex}が最適</strong> — {c.productTip}
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: '0.82rem' }}>
                          <div style={{ marginBottom: '3px' }}><MapPin size={11} style={{ display: 'inline', verticalAlign: 'middle', color: 'var(--text-muted)' }} /> {c.address || `${c.prefecture}${c.city}`}</div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{c.phone}</div>
                        </td>
                        <td>
                          <span className={`status-badge ${c.isActive ? 'status-active' : 'status-bankrupt'}`}>
                            {c.isActive ? <><CheckCircle size={10} style={{ display: 'inline', verticalAlign: 'text-top' }} /> 活動中</> : <><AlertCircle size={10} style={{ display: 'inline', verticalAlign: 'text-top' }} /> 要注意</>}
                          </span>
                        </td>
                        <td>
                          <div style={{ fontWeight: '800', fontSize: '1.05rem', color: scoreColor }}>{c.matchScore}%</div>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{c.matchLevel}</div>
                        </td>
                        <td style={{ minWidth: '200px' }}>
                          {matchedProduct && tierConfig && (
                            <div style={{ marginBottom: '5px' }}>
                              <span style={{ fontSize: '0.75rem', fontWeight: '700', color: tierConfig.color, background: tierConfig.bg, padding: '2px 7px', borderRadius: '5px', border: `1px solid ${tierConfig.border}` }}>
                                商品{c.bestMatchProductIndex}｜{tierConfig.label}
                              </span>
                              {matchedProduct.targetPrice && (
                                <div style={{ fontSize: '0.8rem', color: tierConfig.color, marginTop: '4px', fontWeight: '600' }}>
                                  💰 目標{matchedProduct.pricingType}：{Number(matchedProduct.targetPrice.replace(/,/g, '')).toLocaleString()}円
                                </div>
                              )}
                            </div>
                          )}
                          {c.negotiationStrategy && (
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-main)', lineHeight: '1.5', background: 'rgba(255,255,255,0.04)', padding: '5px 7px', borderRadius: '6px' }}>
                              {c.negotiationStrategy}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {c.predictedNeeds.map((n, ni) => <span key={ni} className="tag">{n}</span>)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* フッターCSV */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '1.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => downloadCsv(false)} style={{ padding: '0.65rem 2rem' }}>
              <Download size={13} style={{ verticalAlign: 'middle', marginRight: '5px' }} />全件CSV ({result.companies.length}社)
            </button>
            <button className="btn btn-primary" onClick={() => downloadCsv(true)} style={{ padding: '0.65rem 2rem' }}>
              <Download size={13} style={{ verticalAlign: 'middle', marginRight: '5px' }} />フィルター結果CSV ({displayedCompanies.length}社)
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
