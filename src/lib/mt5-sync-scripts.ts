export interface Mt5ScriptConfig {
  webhookUrl: string;
  apiToken: string;
  traderId: string;
}

export function generateMt5EaCode(cfg: Mt5ScriptConfig): string {
  const safeUrl = cfg.webhookUrl.replace(/"/g, '\\"');
  const safeToken = cfg.apiToken.replace(/"/g, '\\"');
  const safeTrader = cfg.traderId.replace(/"/g, '\\"');
  let originHint = safeUrl;
  try {
    originHint = new URL(cfg.webhookUrl).origin;
  } catch {
    // keep full url fallback
  }

  return `//+------------------------------------------------------------------+
//|                                                 TCM_LiveSync.mq5 |
//|                     Titan Capital Markets — Zero-Export MT5 Sync |
//|   Trader Desk: ${safeTrader}
//|   1. MT5 -> Tools -> Options -> Expert Advisors:                 |
//|      Enable "Allow WebRequest for listed URL" & add:             |
//|      ${originHint}
//|   2. Compile (F7) in MetaEditor -> drop onto ANY single chart.   |
//+------------------------------------------------------------------+
#property copyright "Titan Capital Markets"
#property version   "1.00"
#property strict

input string InpWebhookUrl        = "${safeUrl}"; // TCM Webhook URL
input string InpApiToken          = "${safeToken}"; // Trader Sync Token (x-tcm-token)
input int    InpHistoryDays       = 30;             // Initial backfill window (days)
input int    InpPollSeconds       = 30;             // Fallback check interval (seconds)
input bool   InpSyncOpenTrades    = true;           // Sync open positions live

struct TcmPosRecord
{
   long     posId;
   string   symbol;
   string   side;
   double   lots;
   datetime entryTime;
   double   entryPrice;
   double   sl;
   double   tp;
   datetime exitTime;
   double   exitPrice;
   double   exitVolSum;
   double   commission;
   double   swap;
   double   profit;
   string   exitReason;
   string   comment;
   bool     hasIn;
   bool     hasOut;
   bool     isOpen;
};

bool     g_dirty         = true;
datetime g_lastCheckAt   = 0;
string   g_lastSentHash  = "";

//+------------------------------------------------------------------+
int OnInit()
{
   EventSetTimer(2);
   g_dirty = true;
   Print("[TCM LiveSync] Attached for desk ${safeTrader}. Running initial sync...");
   SyncNow(true);
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}

void OnTimer()
{
   datetime now = TimeLocal();
   if(g_dirty || (now - g_lastCheckAt >= MathMax(5, InpPollSeconds)))
   {
      SyncNow(false);
   }
}

void OnTradeTransaction(const MqlTradeTransaction &trans,
                        const MqlTradeRequest &request,
                        const MqlTradeResult &result)
{
   if(trans.type == TRADE_TRANSACTION_DEAL_ADD ||
      trans.type == TRADE_TRANSACTION_HISTORY_ADD ||
      trans.type == TRADE_TRANSACTION_POSITION ||
      trans.type == TRADE_TRANSACTION_ORDER_DELETE)
   {
      g_dirty = true;
   }
}

//+------------------------------------------------------------------+
string EscapeJson(const string raw)
{
   string s = raw;
   StringReplace(s, "\\\\", "\\\\\\\\");
   StringReplace(s, "\\"", "\\\\\\"");
   StringReplace(s, "\\r", " ");
   StringReplace(s, "\\n", " ");
   StringReplace(s, "\\t", " ");
   return s;
}

string FormatDateTimeIso(const datetime dt)
{
   if(dt <= 0) return "";
   string s = TimeToString(dt, TIME_DATE | TIME_SECONDS);
   StringReplace(s, ".", "-");
   return s;
}

int SymbolDigitsSafe(const string sym)
{
   long d = 0;
   if(SymbolInfoInteger(sym, SYMBOL_DIGITS, d) && d > 0 && d <= 8)
      return (int)d;
   return 5;
}

string DealReasonToText(const ENUM_DEAL_REASON reason)
{
   if(reason == DEAL_REASON_SL) return "Stop loss hit";
   if(reason == DEAL_REASON_TP) return "Take profit hit";
   if(reason == DEAL_REASON_SO) return "Stop out";
   return "Manual close";
}

int FindOrAddPos(TcmPosRecord &arr[], const long posId)
{
   int total = ArraySize(arr);
   for(int i = 0; i < total; i++)
   {
      if(arr[i].posId == posId) return i;
   }
   ArrayResize(arr, total + 1);
   arr[total].posId      = posId;
   arr[total].symbol     = "";
   arr[total].side       = "";
   arr[total].lots       = 0.0;
   arr[total].entryTime  = 0;
   arr[total].entryPrice = 0.0;
   arr[total].sl         = 0.0;
   arr[total].tp         = 0.0;
   arr[total].exitTime   = 0;
   arr[total].exitPrice  = 0.0;
   arr[total].exitVolSum = 0.0;
   arr[total].commission = 0.0;
   arr[total].swap       = 0.0;
   arr[total].profit     = 0.0;
   arr[total].exitReason = "";
   arr[total].comment    = "";
   arr[total].hasIn      = false;
   arr[total].hasOut     = false;
   arr[total].isOpen     = false;
   return total;
}

bool IsCurrentlyOpenPos(const long posId)
{
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket > 0 && PositionGetInteger(POSITION_IDENTIFIER) == posId)
         return true;
   }
   return false;
}

string BuildTradeJson(const TcmPosRecord &r)
{
   int digits = SymbolDigitsSafe(r.symbol);
   string j = "{";
   j += "\\"brokerTicket\\":\\"" + IntegerToString(r.posId) + "\\",";
   j += "\\"pair\\":\\"" + EscapeJson(r.symbol) + "\\",";
   j += "\\"position\\":\\"" + r.side + "\\",";
   j += "\\"lots\\":" + DoubleToString(r.lots, 2) + ",";
   j += "\\"entryDatetime\\":\\"" + FormatDateTimeIso(r.entryTime) + "\\",";
   j += "\\"entryPrice\\":" + DoubleToString(r.entryPrice, digits) + ",";
   if(r.sl > 0.0)
      j += "\\"stopLoss\\":" + DoubleToString(r.sl, digits) + ",";
   if(r.tp > 0.0)
      j += "\\"takeProfit\\":" + DoubleToString(r.tp, digits) + ",";
   if(!r.isOpen && r.exitPrice > 0.0 && r.exitTime > 0)
   {
      j += "\\"exitDatetime\\":\\"" + FormatDateTimeIso(r.exitTime) + "\\",";
      j += "\\"exitPrice\\":" + DoubleToString(r.exitPrice, digits) + ",";
      j += "\\"brokerPnl\\":" + DoubleToString(r.profit, 2) + ",";
      if(StringLen(r.exitReason) > 0)
         j += "\\"exitReason\\":\\"" + EscapeJson(r.exitReason) + "\\",";
   }
   j += "\\"commission\\":" + DoubleToString(r.commission, 2) + ",";
   j += "\\"swap\\":" + DoubleToString(r.swap, 2);
   if(StringLen(r.comment) > 0)
      j += ",\\"notes\\":\\"" + EscapeJson(r.comment) + "\\"";
   j += "}";
   return j;
}

bool PostBatch(const string &items[], const int startIdx, const int endIdx)
{
   string json = "{\\"fileName\\":\\"MT5_EA_LiveSync\\",\\"trades\\":[";
   for(int i = startIdx; i < endIdx; i++)
   {
      if(i > startIdx) json += ",";
      json += items[i];
   }
   json += "]}";

   uchar postData[];
   int len = StringToCharArray(json, postData, 0, WHOLE_ARRAY, CP_UTF8);
   if(len > 0 && postData[len - 1] == 0)
      ArrayResize(postData, len - 1);

   string headers = "Content-Type: application/json\\r\\nx-tcm-token: " + InpApiToken + "\\r\\n";
   uchar  resultData[];
   string resultHeaders = "";

   ResetLastError();
   int status = WebRequest("POST", InpWebhookUrl, headers, 10000, postData, resultData, resultHeaders);
   if(status == -1)
   {
      int err = GetLastError();
      Print("[TCM LiveSync] WebRequest failed (error ", err, "). Add ${originHint} in MT5 Tools -> Options -> Expert Advisors -> Allow WebRequest.");
      return false;
   }

   string resp = CharArrayToString(resultData, 0, WHOLE_ARRAY, CP_UTF8);
   if(status >= 200 && status < 300)
   {
      Print("[TCM LiveSync] Synced batch (", (endIdx - startIdx), " trades) -> ", resp);
      return true;
   }
   Print("[TCM LiveSync] Server returned HTTP ", status, ": ", resp);
   return false;
}

void SyncNow(const bool forceSend)
{
   g_dirty       = false;
   g_lastCheckAt = TimeLocal();

   TcmPosRecord records[];

   // 1. Collect closed positions from deal history
   datetime toTime   = TimeCurrent() + 86400;
   datetime fromTime = TimeCurrent() - (datetime)MathMax(1, InpHistoryDays) * 86400;
   if(HistorySelect(fromTime, toTime))
   {
      int deals = HistoryDealsTotal();
      for(int i = 0; i < deals; i++)
      {
         ulong dealTicket = HistoryDealGetTicket(i);
         if(dealTicket == 0) continue;

         ENUM_DEAL_TYPE dtype = (ENUM_DEAL_TYPE)HistoryDealGetInteger(dealTicket, DEAL_TYPE);
         if(dtype != DEAL_TYPE_BUY && dtype != DEAL_TYPE_SELL) continue;

         long posId = HistoryDealGetInteger(dealTicket, DEAL_POSITION_ID);
         if(posId <= 0) continue;

         ENUM_DEAL_ENTRY dentry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(dealTicket, DEAL_ENTRY);
         int idx = FindOrAddPos(records, posId);

         if(dentry == DEAL_ENTRY_IN)
         {
            double vol = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
            double px  = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
            if(records[idx].lots + vol > 0.0)
               records[idx].entryPrice = (records[idx].entryPrice * records[idx].lots + px * vol) / (records[idx].lots + vol);
            records[idx].lots      += vol;
            records[idx].symbol     = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
            records[idx].side       = (dtype == DEAL_TYPE_BUY) ? "Buy" : "Sell";
            if(records[idx].entryTime == 0)
               records[idx].entryTime = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);

            double dsl = HistoryDealGetDouble(dealTicket, DEAL_SL);
            double dtp = HistoryDealGetDouble(dealTicket, DEAL_TP);
            if(dsl <= 0.0 || dtp <= 0.0)
            {
               ulong ord = (ulong)HistoryDealGetInteger(dealTicket, DEAL_ORDER);
               if(ord > 0 && HistoryOrderSelect(ord))
               {
                  if(dsl <= 0.0) dsl = HistoryOrderGetDouble(ord, ORDER_SL);
                  if(dtp <= 0.0) dtp = HistoryOrderGetDouble(ord, ORDER_TP);
               }
            }
            if(dsl > 0.0) records[idx].sl = dsl;
            if(dtp > 0.0) records[idx].tp = dtp;
            if(StringLen(records[idx].comment) == 0)
               records[idx].comment = HistoryDealGetString(dealTicket, DEAL_COMMENT);
            records[idx].commission += HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
            records[idx].swap       += HistoryDealGetDouble(dealTicket, DEAL_SWAP);
            records[idx].hasIn       = true;
         }
         else if(dentry == DEAL_ENTRY_OUT || dentry == DEAL_ENTRY_OUT_BY || dentry == DEAL_ENTRY_INOUT)
         {
            double outVol = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
            double outPx  = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
            if(records[idx].exitVolSum + outVol > 0.0)
               records[idx].exitPrice = (records[idx].exitPrice * records[idx].exitVolSum + outPx * outVol) / (records[idx].exitVolSum + outVol);
            records[idx].exitVolSum += outVol;
            records[idx].exitTime    = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
            records[idx].commission += HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
            records[idx].swap       += HistoryDealGetDouble(dealTicket, DEAL_SWAP);
            records[idx].profit     += HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
            records[idx].exitReason  = DealReasonToText((ENUM_DEAL_REASON)HistoryDealGetInteger(dealTicket, DEAL_REASON));
            double dslOut = HistoryDealGetDouble(dealTicket, DEAL_SL);
            double dtpOut = HistoryDealGetDouble(dealTicket, DEAL_TP);
            if(dslOut > 0.0) records[idx].sl = dslOut;
            if(dtpOut > 0.0) records[idx].tp = dtpOut;
            records[idx].hasOut = true;
         }
      }
   }

   // 2. Collect open positions & assemble JSON payload items
   string jsonItems[];
   int count = 0;

   int recTotal = ArraySize(records);
   for(int i = 0; i < recTotal; i++)
   {
      if(!records[i].hasIn || !records[i].hasOut) continue;
      if(IsCurrentlyOpenPos(records[i].posId)) continue;
      records[i].isOpen = false;
      ArrayResize(jsonItems, count + 1);
      jsonItems[count++] = BuildTradeJson(records[i]);
   }

   if(InpSyncOpenTrades)
   {
      int openTotal = PositionsTotal();
      for(int i = 0; i < openTotal; i++)
      {
         ulong ticket = PositionGetTicket(i);
         if(ticket == 0) continue;
         TcmPosRecord op;
         op.posId      = PositionGetInteger(POSITION_IDENTIFIER);
         op.symbol     = PositionGetString(POSITION_SYMBOL);
         op.side       = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? "Buy" : "Sell";
         op.lots       = PositionGetDouble(POSITION_VOLUME);
         op.entryTime  = (datetime)PositionGetInteger(POSITION_TIME);
         op.entryPrice = PositionGetDouble(POSITION_PRICE_OPEN);
         op.sl         = PositionGetDouble(POSITION_SL);
         op.tp         = PositionGetDouble(POSITION_TP);
         op.exitTime   = 0;
         op.exitPrice  = 0.0;
         op.exitVolSum = 0.0;
         op.commission = 0.0;
         op.swap       = PositionGetDouble(POSITION_SWAP);
         op.profit     = 0.0;
         op.exitReason = "";
         op.comment    = PositionGetString(POSITION_COMMENT);
         op.isOpen     = true;
         ArrayResize(jsonItems, count + 1);
         jsonItems[count++] = BuildTradeJson(op);
      }
   }

   if(count == 0) return;

   // Avoid redundant network calls if nothing changed since last sync
   string digest = "";
   for(int i = 0; i < count; i++) digest += jsonItems[i];
   if(!forceSend && digest == g_lastSentHash) return;

   bool allOk = true;
   int batchSize = 40;
   for(int start = 0; start < count; start += batchSize)
   {
      int end = MathMin(start + batchSize, count);
      if(!PostBatch(jsonItems, start, end))
      {
         allOk = false;
         break;
      }
   }
   if(allOk) g_lastSentHash = digest;
}
//+------------------------------------------------------------------+
`;
}

export function generateMt5PythonScript(cfg: Mt5ScriptConfig): string {
  return `"""
Titan Capital Markets — Zero-Export MT5 Auto-Sync Watcher
Trader Desk: ${cfg.traderId}

Prerequisites (one-time on Windows where MT5 is running):
    pip install MetaTrader5 requests

Run in terminal:
    python tcm_mt5_autosync.py
"""

import argparse
import hashlib
import json
import time
from datetime import datetime, timedelta, timezone

import MetaTrader5 as mt5
import requests

WEBHOOK_URL = "${cfg.webhookUrl}"
API_TOKEN = "${cfg.apiToken}"
HISTORY_DAYS = 30
POLL_SECONDS = 15


def fmt_ts(ts: int) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def deal_reason_label(reason: int) -> str:
    if reason == getattr(mt5, "DEAL_REASON_SL", -1):
        return "Stop loss hit"
    if reason == getattr(mt5, "DEAL_REASON_TP", -1):
        return "Take profit hit"
    if reason == getattr(mt5, "DEAL_REASON_SO", -1):
        return "Stop out"
    return "Manual close"


def collect_trades(history_days: int) -> list[dict]:
    open_positions = mt5.positions_get() or []
    open_pos_ids = {p.identifier for p in open_positions}

    to_dt = datetime.now(timezone.utc) + timedelta(days=1)
    from_dt = datetime.now(timezone.utc) - timedelta(days=history_days)
    deals = mt5.history_deals_get(from_dt, to_dt) or []

    grouped: dict[int, dict] = {}
    for d in deals:
        if d.type not in (mt5.DEAL_TYPE_BUY, mt5.DEAL_TYPE_SELL):
            continue
        pos_id = d.position_id
        if not pos_id or pos_id in open_pos_ids:
            continue

        rec = grouped.setdefault(
            pos_id,
            {
                "brokerTicket": str(pos_id),
                "pair": d.symbol,
                "position": "Buy" if d.type == mt5.DEAL_TYPE_BUY else "Sell",
                "lots": 0.0,
                "entry_num": 0.0,
                "entryDatetime": None,
                "stopLoss": None,
                "takeProfit": None,
                "exit_vol": 0.0,
                "exit_num": 0.0,
                "exitDatetime": None,
                "commission": 0.0,
                "swap": 0.0,
                "brokerPnl": 0.0,
                "exitReason": None,
                "notes": None,
                "has_in": False,
                "has_out": False,
            },
        )

        rec["commission"] += float(d.commission)
        rec["swap"] += float(d.swap)

        if d.entry == mt5.DEAL_ENTRY_IN:
            rec["has_in"] = True
            rec["lots"] += float(d.volume)
            rec["entry_num"] += float(d.price) * float(d.volume)
            if rec["entryDatetime"] is None:
                rec["entryDatetime"] = fmt_ts(d.time)
            if getattr(d, "sl", 0.0):
                rec["stopLoss"] = float(d.sl)
            if getattr(d, "tp", 0.0):
                rec["takeProfit"] = float(d.tp)
            if d.comment and not rec["notes"]:
                rec["notes"] = d.comment
        elif d.entry in (mt5.DEAL_ENTRY_OUT, mt5.DEAL_ENTRY_OUT_BY, mt5.DEAL_ENTRY_INOUT):
            rec["has_out"] = True
            rec["exit_vol"] += float(d.volume)
            rec["exit_num"] += float(d.price) * float(d.volume)
            rec["exitDatetime"] = fmt_ts(d.time)
            rec["brokerPnl"] += float(d.profit)
            rec["exitReason"] = deal_reason_label(d.reason)
            if getattr(d, "sl", 0.0):
                rec["stopLoss"] = float(d.sl)
            if getattr(d, "tp", 0.0):
                rec["takeProfit"] = float(d.tp)

    payload_trades: list[dict] = []

    for pos_id, rec in grouped.items():
        if not (rec["has_in"] and rec["has_out"] and rec["lots"] > 0 and rec["exit_vol"] > 0):
            continue
        if rec["stopLoss"] is None or rec["takeProfit"] is None:
            orders = mt5.history_orders_get(position=pos_id) or []
            for o in orders:
                if rec["stopLoss"] is None and o.sl > 0:
                    rec["stopLoss"] = float(o.sl)
                if rec["takeProfit"] is None and o.tp > 0:
                    rec["takeProfit"] = float(o.tp)

        payload_trades.append(
            {
                "brokerTicket": rec["brokerTicket"],
                "pair": rec["pair"],
                "position": rec["position"],
                "lots": round(rec["lots"], 2),
                "entryDatetime": rec["entryDatetime"],
                "entryPrice": rec["entry_num"] / rec["lots"],
                "stopLoss": rec["stopLoss"],
                "takeProfit": rec["takeProfit"],
                "exitDatetime": rec["exitDatetime"],
                "exitPrice": rec["exit_num"] / rec["exit_vol"],
                "commission": round(rec["commission"], 2),
                "swap": round(rec["swap"], 2),
                "brokerPnl": round(rec["brokerPnl"], 2),
                "exitReason": rec["exitReason"],
                "notes": rec["notes"],
            }
        )

    for p in open_positions:
        payload_trades.append(
            {
                "brokerTicket": str(p.identifier),
                "pair": p.symbol,
                "position": "Buy" if p.type == mt5.POSITION_TYPE_BUY else "Sell",
                "lots": round(float(p.volume), 2),
                "entryDatetime": fmt_ts(p.time),
                "entryPrice": float(p.price_open),
                "stopLoss": float(p.sl) if p.sl > 0 else None,
                "takeProfit": float(p.tp) if p.tp > 0 else None,
                "commission": 0.0,
                "swap": round(float(p.swap), 2),
                "notes": p.comment or None,
            }
        )

    return payload_trades


def push_trades(trades: list[dict]) -> None:
    headers = {
        "Content-Type": "application/json",
        "x-tcm-token": API_TOKEN,
    }
    for i in range(0, len(trades), 50):
        chunk = trades[i : i + 50]
        resp = requests.post(
            WEBHOOK_URL,
            headers=headers,
            json={"fileName": "MT5_Python_LiveSync", "trades": chunk},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
        print(
            f"[TCM Sync] {data.get('traderId')}: "
            f"+{data.get('insertedCount', 0)} new, "
            f"{data.get('updatedCount', 0)} closed/updated, "
            f"{data.get('skippedCount', 0)} already synced"
        )


def main() -> None:
    parser = argparse.ArgumentParser(description="TCM Journal MT5 Live Auto-Sync")
    parser.add_argument("--once", action="store_true", help="Sync once and exit")
    parser.add_argument("--days", type=int, default=HISTORY_DAYS, help="Backfill days")
    args = parser.parse_args()

    if not mt5.initialize():
        raise RuntimeError(f"MT5 initialize() failed: {mt5.last_error()}")

    print(f"[TCM Sync] Connected to MT5 terminal for desk ${cfg.traderId}. Syncing to {WEBHOOK_URL}")
    last_digest = ""

    try:
        while True:
            trades = collect_trades(args.days)
            digest = hashlib.sha256(json.dumps(trades, sort_keys=True).encode()).hexdigest()
            if trades and digest != last_digest:
                push_trades(trades)
                last_digest = digest
            if args.once:
                break
            time.sleep(POLL_SECONDS)
    finally:
        mt5.shutdown()


if __name__ == "__main__":
    main()
`;
}
