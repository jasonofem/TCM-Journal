export type UserRole = 'admin' | 'trader';

export type PositionSide = 'Buy' | 'Sell';

export type TradeOutcome = 'Win' | 'Loss' | 'BE' | 'Open';

export type TradingSession = 'Asian' | 'Tokyo' | 'London' | 'New York';

export type TradeSource =
  | 'manual'
  | 'html_import'
  | 'excel_import'
  | 'paste_import'
  | 'json_import'
  | 'webhook'
  | 'example';

export interface UserProfile {
  id: string;
  traderId: string;
  name: string;
  email: string | null;
  role: UserRole;
  tier: string;
  accountNumber: string | null;
  accountName: string;
  initialCapital: number;
  currency: string;
  defaultRiskPct: number;
  breakevenThreshold: number;
  dailyLossLimitPct: number;
  timezoneOffsetHours: number;
  apiToken: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TradeRecord {
  id: string;
  userId: string;
  sn: number;
  pair: string;
  position: PositionSide;
  setup: string;
  customSetup: string | null;
  entryDate: string; // YYYY-MM-DD
  entryTime: string; // HH:MM:SS
  entryDatetime: string; // YYYY-MM-DD HH:MM:SS
  dayOfWeek: string;
  session: TradingSession;
  lots: number;
  riskAmount: number | null;
  riskPct: number | null;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  exitPrice: number | null;
  exitDate: string | null;
  exitTime: string | null;
  exitDatetime: string | null;
  exitReason: string | null;
  commission: number;
  swap: number;
  brokerPnl: number | null;
  followedPlan: string | null;
  marketCondition: string | null;
  timeframe: string | null;
  emotion: string | null;
  brokerTicket: string | null;
  fingerprint: string;
  chartUrl: string | null;
  beforeScreenshot: string | null;
  afterScreenshot: string | null;
  mistakes: string | null;
  maePips: number | null;
  mfePips: number | null;
  notes: string | null;
  source: TradeSource;
  importBatchId: string | null;
  adminReviewNote: string | null;
  adminReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QualityFlag {
  level: 'error' | 'warning';
  message: string;
}

export interface ComputedTrade extends TradeRecord {
  effectiveSetup: string;
  pipSize: number;
  slPips: number | null;
  tpPips: number | null;
  resultPips: number | null;
  plannedRr: number | null;
  realizedRr: number | null;
  durationMinutes: number | null;
  durationLabel: string;
  grossPnl: number | null;
  netPnl: number | null;
  pnlSource: 'broker' | 'estimated' | 'open';
  outcome: TradeOutcome;
  balanceAfter: number | null;
  computedRiskAmount: number | null;
  computedRiskPct: number | null;
  flags: QualityFlag[];
}

export interface TradeInput {
  pair: string;
  position: PositionSide;
  setup: string;
  customSetup?: string | null;
  entryDate: string;
  entryTime: string;
  session?: TradingSession;
  lots: number;
  riskAmount?: number | null;
  riskPct?: number | null;
  entryPrice: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  exitPrice?: number | null;
  exitDate?: string | null;
  exitTime?: string | null;
  exitReason?: string | null;
  commission?: number;
  swap?: number;
  brokerPnl?: number | null;
  followedPlan?: string | null;
  marketCondition?: string | null;
  timeframe?: string | null;
  emotion?: string | null;
  brokerTicket?: string | null;
  chartUrl?: string | null;
  beforeScreenshot?: string | null;
  afterScreenshot?: string | null;
  mistakes?: string | null;
  maePips?: number | null;
  mfePips?: number | null;
  notes?: string | null;
  source?: TradeSource;
}

export interface ParsedTradeCandidate {
  tempId: string;
  brokerTicket: string | null;
  pair: string;
  rawSymbol: string;
  position: PositionSide;
  lots: number;
  entryDate: string;
  entryTime: string;
  entryDatetime: string;
  exitDate: string | null;
  exitTime: string | null;
  exitDatetime: string | null;
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  exitPrice: number | null;
  commission: number;
  swap: number;
  brokerPnl: number | null;
  riskAmount: number | null;
  setup: string | null;
  session: TradingSession | null;
  notes: string | null;
  mistakes: string | null;
  beforeScreenshot: string | null;
  afterScreenshot: string | null;
  comment: string | null;
  exitReason: string | null;
  isOpen: boolean;
  fingerprint: string;
}

export type DedupeAction = 'NEW' | 'UPDATE_CLOSE' | 'SKIP_DUPLICATE';

export interface ClassifiedImportRow {
  candidate: ParsedTradeCandidate;
  action: DedupeAction;
  reason: string;
  matchedTradeId: string | null;
  matchedTradeSn: number | null;
  session: TradingSession;
  setup: string;
  timeframe: string | null;
  include: boolean;
}

export interface ImportPreviewResponse {
  fileName: string;
  detectedFormat: string;
  accountMeta: {
    accountNumber: string | null;
    accountName: string | null;
    currency: string | null;
    reportedBalance: number | null;
  };
  stats: {
    totalParsed: number;
    newCount: number;
    updateCount: number;
    duplicateCount: number;
    ignoredRows: number;
  };
  warnings: string[];
  items: ClassifiedImportRow[];
}

export interface ImportBatchRecord {
  id: string;
  userId: string;
  fileName: string;
  sourceType: string;
  totalParsed: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  reportTimezoneOffset: number;
  createdAt: string;
}

export interface DashboardFilters {
  pair: string;
  weekday: string;
  session: string;
  setup: string;
  dateFrom: string;
  dateTo: string;
}

export interface BreakdownRow {
  label: string;
  trades: number;
  wins: number;
  losses: number;
  be: number;
  winRate: number;
  netPnl: number;
  avgPnl: number;
  profitFactor: number | null;
}

export interface EquityPoint {
  index: number;
  label: string;
  date: string;
  pair: string;
  netPnl: number;
  cumPnl: number;
  equity: number;
  drawdown: number;
}

export interface FirmEquityPoint {
  index: number;
  label: string;
  date: string;
  datetime: string;
  traderIdCode: string;
  traderName: string;
  pair: string;
  netPnl: number;
  cumPnl: number;
  equity: number;
  peakEquity: number;
  drawdown: number;
  drawdownPct: number;
}

export interface DashboardMetrics {
  closedCount: number;
  openCount: number;
  totalCount: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number | null;
  winRateExclBe: number | null;
  totalNetPnl: number;
  grossProfit: number;
  grossLoss: number;
  profitFactor: number | null;
  profitFactorInfinite: boolean;
  currentEquity: number;
  roiPct: number;
  largestWin: number | null;
  largestLoss: number | null;
  averageWin: number | null;
  averageLoss: number | null;
  expectancy: number | null;
  maxDrawdown: number;
  maxDrawdownPct: number;
  todayPnl: number;
  todayLossPct: number;
  dllBreachedToday: boolean;
  planAdherencePct: number | null;
  insightSummary: string;
  bestPair: BreakdownRow | null;
  worstPair: BreakdownRow | null;
  bestSession: BreakdownRow | null;
  bestSetup: BreakdownRow | null;
  bestWeekday: BreakdownRow | null;
  equityCurve: EquityPoint[];
  byPair: BreakdownRow[];
  bySession: BreakdownRow[];
  byWeekday: BreakdownRow[];
  bySetup: BreakdownRow[];
  byMonthly: BreakdownRow[];
  rrBuckets: { label: string; count: number }[];
  recentTape: ComputedTrade[];
}

export interface FirmTraderSummary {
  user: Omit<UserProfile, 'apiToken'>;
  metrics: {
    totalTrades: number;
    closedTrades: number;
    openTrades: number;
    wins: number;
    losses: number;
    breakeven: number;
    winRate: number | null;
    totalNetPnl: number;
    currentEquity: number;
    roiPct: number;
    profitFactor: number | null;
    maxDrawdownPct: number;
    todayPnl: number;
    todayLossPct: number;
    dllBreachedToday: boolean;
    noSlCount: number;
    lastTradeDate: string | null;
    lastSyncAt: string | null;
  };
}

export interface FirmOverviewResponse {
  firmTotals: {
    traderCount: number;
    activeTraders: number;
    totalInitialCapital: number;
    totalCurrentEquity: number;
    combinedNetPnl: number;
    firmRoiPct: number;
    firmPeakEquity: number;
    firmMaxDrawdown: number;
    firmMaxDrawdownPct: number;
    combinedClosedTrades: number;
    combinedOpenTrades: number;
    firmWinRate: number | null;
    firmProfitFactor: number | null;
    dllBreachCount: number;
    tradesToday: number;
  };
  firmEquityCurve: FirmEquityPoint[];
  traders: FirmTraderSummary[];
  recentFirmTrades: Array<ComputedTrade & { traderIdCode: string; traderName: string }>;
  recentBatches: Array<ImportBatchRecord & { traderIdCode: string; traderName: string }>;
}
