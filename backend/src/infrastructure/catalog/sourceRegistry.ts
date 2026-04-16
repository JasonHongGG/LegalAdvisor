import type { SourceCatalogEntry } from '../../domain/sourceCatalog.js';

const catalog: SourceCatalogEntry[] = [
  {
    id: 'moj-laws',
    name: '法務部全國法規資料庫',
    shortName: '全國法規',
    sourceType: 'api',
    implementationMode: 'stable',
    baseUrl: 'https://law.moj.gov.tw/api',
    description: '使用全國法規資料庫官方 OpenAPI 下載法規 JSON 壓縮檔，並依指定法規名稱過濾與輸出快照。',
    notes: '第一版直接透過官方 OpenAPI 下載中文法律資料，再產出 JSON/MD 快照。',
    supportedTargetKinds: ['law'],
    capabilities: ['health-check', 'crawl-law-archive', 'checkpoint', 'json-output', 'markdown-output'],
    recommendedConcurrency: 1,
    taskBuilderFields: [
      { name: 'label', label: '任務名稱', type: 'text', required: true, placeholder: '例如：民法' },
      { name: 'query', label: '法規名稱或關鍵字', type: 'text', required: true, placeholder: '例如：民法' },
      { name: 'exactMatch', label: '精準比對名稱', type: 'checkbox', required: false, description: '僅接受完整相同的法規名稱。' },
    ],
  },
  {
    id: 'judicial-sites',
    name: '司法院網站（補充）',
    shortName: '司法院網站',
    sourceType: 'site',
    implementationMode: 'stable',
    baseUrl: 'https://www.judicial.gov.tw/',
    description: '抓取司法院公開網站的列表頁與明細頁，輸出乾淨的 JSON/MD 快照。',
    notes: '第一版支援輸入起始列表頁網址與最大頁數，適合公告、業務說明等補充資料。',
    supportedTargetKinds: ['judicial-list'],
    capabilities: ['health-check', 'crawl-html-list', 'checkpoint', 'json-output', 'markdown-output'],
    recommendedConcurrency: 1,
    taskBuilderFields: [
      { name: 'label', label: '任務名稱', type: 'text', required: true, placeholder: '例如：本會公告' },
      { name: 'startUrl', label: '起始列表網址', type: 'url', required: true, placeholder: 'https://www.judicial.gov.tw/tw/lp-1724-1.html' },
      { name: 'maxPages', label: '最多抓取頁數', type: 'number', required: true, placeholder: '3', description: '第一版建議先小批次測試。' },
    ],
  },
  {
    id: 'judicial-judgments',
    name: '司法院裁判書系統',
    shortName: '裁判書',
    sourceType: 'dataset',
    implementationMode: 'preview',
    baseUrl: 'https://opendata.judicial.gov.tw/',
    description: '第一版以司法院開放資料 fileset 下載為主，保留未來切換裁判書搜尋模式的欄位與任務結構。',
    notes: '目前採 fileset 模式，適合先抓取 JSON/CSV 型資料集；更細的搜尋模式會在後續版本補強。',
    supportedTargetKinds: ['judgment-dataset'],
    capabilities: ['health-check', 'download-fileset', 'checkpoint', 'json-output', 'markdown-output'],
    recommendedConcurrency: 1,
    taskBuilderFields: [
      { name: 'label', label: '任務名稱', type: 'text', required: true, placeholder: '例如：最高法院民事資料集' },
      { name: 'fileSetId', label: 'Fileset Id', type: 'number', required: true, placeholder: '1038', description: '可由司法院開放資料平台查得。第一版優先支援 JSON/CSV 檔型 fileset。' },
      { name: 'top', label: '取得筆數上限', type: 'number', required: false, placeholder: '50' },
      { name: 'skip', label: '跳過筆數', type: 'number', required: false, placeholder: '0' },
    ],
  },
];

export const sourceRegistry = {
  list() {
    return catalog.map((entry) => structuredClone(entry));
  },
  get(sourceId: SourceCatalogEntry['id']) {
    const entry = catalog.find((item) => item.id === sourceId);
    return entry ? structuredClone(entry) : null;
  },
};