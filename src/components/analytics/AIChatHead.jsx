import { useCallback, useEffect, useRef, useState } from 'react';
import { generateAIAnalysis } from '../../lib/aiAnalystService';
import { useLiveAnalyst } from '../../context/LiveAnalystProvider';
import { BotIcon } from './AnalyticsIcons';
import styles from './AIChatHead.module.css';

function formatResponse(result) {
  if (!result) return 'I could not generate a response yet.';
  const parts = [
    result.answer,
    Array.isArray(result.keyPoints) && result.keyPoints.length > 0
      ? `Key points: ${result.keyPoints.join(' ')}`
      : '',
    result.recommendation ? `Recommendation: ${result.recommendation}` : '',
  ].filter(Boolean);
  return parts.join('\n\n') || 'I finished reviewing the latest operations data.';
}

function getKnownBusinessTerms(analyticsData = {}) {
  const terms = new Set();

  Object.values(analyticsData.products || {}).forEach((product) => {
    if (product?.name) terms.add(String(product.name).toLowerCase());
  });

  Object.values(analyticsData.inventory || {}).forEach((item) => {
    if (item?.name) terms.add(String(item.name).toLowerCase());
    if (item?.productName) terms.add(String(item.productName).toLowerCase());
  });

  return Array.from(terms).filter((term) => term.length >= 3);
}

function isWorkRelatedQuestion(question, analyticsData) {
  const normalized = question.toLowerCase();
  const workTerms = [
    'sales', 'revenue', 'order', 'orders', 'inventory', 'stock', 'stockout',
    'restock', 'staff', 'staffing', 'shift', 'menu', 'product', 'item',
    'customer', 'branch', 'analytics', 'forecast', 'demand', 'promotion',
    'pricing', 'price', 'cost', 'profit', 'margin', 'waste', 'prep',
    'preparation', 'rush', 'peak', 'slow', 'transaction', 'payment',
    'report', 'dashboard', 'ai usage', 'operations', 'service',
  ];

  if (workTerms.some((term) => normalized.includes(term))) return true;
  return getKnownBusinessTerms(analyticsData).some((term) => normalized.includes(term));
}

export default function AIChatHead() {
  const { analyticsData, activeBranch: branchId } = useLiveAnalyst();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      text: 'Ask me about sales, inventory, staffing, menu performance, or what-if operations decisions.',
    },
  ]);
  const [loading, setLoading] = useState(false);
  const bodyRef = useRef(null);
  const hasData = Number(analyticsData?.summary?.totalOrders || 0) > 0;

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, loading, open]);

  const handleSubmit = useCallback(async (event) => {
    event.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setInput('');
    setMessages((current) => [...current, { role: 'manager', text: question }]);

    if (!isWorkRelatedQuestion(question, analyticsData)) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          text: 'I can only help with restaurant work here. Ask me about sales, inventory, staffing, menu performance, branch analytics, or a what-if operations decision.',
        },
      ]);
      return;
    }

    if (!hasData) {
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: 'I need completed order data before I can analyze operations.' },
      ]);
      return;
    }

    setLoading(true);
    try {
      const result = await generateAIAnalysis(
        {
          ...analyticsData,
          reportContext: {
            asOfLabel: 'AI operations manager chat',
            scenario: question,
          },
        },
        branchId,
        true,
        'opschat',
      );

      setMessages((current) => [
        ...current,
        { role: 'assistant', text: formatResponse(result) },
      ]);
    } catch (error) {
      setMessages((current) => [
        ...current,
        { role: 'assistant', text: error.message || 'I could not answer that right now.' },
      ]);
    } finally {
      setLoading(false);
    }
  }, [analyticsData, branchId, hasData, input, loading]);

  return (
    <>
      <button
        className={`${styles.chatHead} ${open ? styles.active : ''}`}
        onClick={() => setOpen((current) => !current)}
        aria-label={open ? 'Close AI Operations Manager chat' : 'Open AI Operations Manager chat'}
        title="AI Operations Manager"
      >
        <BotIcon size={24} />
      </button>

      <div className={`${styles.chatPanel} ${open ? styles.open : ''}`}>
        <div className={styles.panelHeader}>
          <div className={styles.panelAvatar}>
            <BotIcon size={18} />
          </div>
          <div className={styles.panelInfo}>
            <p className={styles.panelName}>AI Operations Manager</p>
            <p className={styles.panelStatus}>
              <span className={styles.statusDot} />
              Work questions only
            </p>
          </div>
          <button className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Close">
            x
          </button>
        </div>

        <div className={styles.chatBody} ref={bodyRef}>
          {messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`${styles.messageBubble} ${message.role === 'manager' ? styles.manager : styles.assistant}`}
            >
              {message.text.split('\n').map((line, lineIndex) => (
                <p key={`${index}-${lineIndex}`}>{line}</p>
              ))}
            </div>
          ))}
          {loading && (
            <div className={`${styles.messageBubble} ${styles.assistant}`}>
              Reviewing the latest operations data...
            </div>
          )}
        </div>

        <form className={styles.chatForm} onSubmit={handleSubmit}>
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Ask about sales, inventory, staffing..."
            className={styles.chatInput}
          />
          <button type="submit" className={styles.sendBtn} disabled={loading || !input.trim()}>
            Ask
          </button>
        </form>
      </div>
    </>
  );
}
