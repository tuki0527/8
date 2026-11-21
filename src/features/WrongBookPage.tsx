import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EyeOff, Play, RotateCcw, Trash2 } from 'lucide-react';
import { ALL_CONCEPTS, CANONICAL_CHAPTERS, CHAPTERS_BY_ID } from '../data/curriculum/index.ts';
import { CSharpCodeBlock } from '../components/CSharpCodeBlock.tsx';
import { useStudy } from '../context/StudyContext.tsx';
import { createTestRun } from '../domain/quizEngine.ts';
import { createDeletionTombstone, recordTestRunStart } from '../storage/studyStore.ts';

export const WrongBookPage: React.FC = () => {
  const navigate = useNavigate();
  const { settings, snapshot, reloadSnapshot, wrongBookEntries } = useStudy();

  const [statusFilter, setStatusFilter] = useState<'active_wrong' | 'retried_passed' | 'all'>('active_wrong');
  const [chapterFilter, setChapterFilter] = useState('all');
  const [conceptFilter, setConceptFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState<'all' | '7d' | '30d'>('all');
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const availableConcepts = useMemo(() => {
    if (chapterFilter === 'all') return ALL_CONCEPTS;
    return CHAPTERS_BY_ID.get(chapterFilter)?.concepts ?? ALL_CONCEPTS;
  }, [chapterFilter]);

  const filtered = useMemo(() => {
    const nowMs = Date.now();
    return wrongBookEntries.filter((entry) => {
      const latestRetry = entry.retryHistory[entry.retryHistory.length - 1];
      const passedLater = Boolean(latestRetry && latestRetry.status === 'graded' && latestRetry.correct === true);

      if (statusFilter === 'active_wrong' && (entry.hiddenFromWrongBook || passedLater)) {
        return false;
      }
      if (statusFilter === 'retried_passed' && !passedLater) {
        return false;
      }
      if (chapterFilter !== 'all' && entry.chapterId !== chapterFilter) {
        return false;
      }
      if (conceptFilter !== 'all' && entry.primaryConceptId !== conceptFilter) {
        return false;
      }
      if (dateFilter !== 'all') {
        const days = dateFilter === '7d' ? 7 : 30;
        if (nowMs - new Date(entry.submittedAt).getTime() > days * 86400000) {
          return false;
        }
      }
      return true;
    });
  }, [wrongBookEntries, statusFilter, chapterFilter, conceptFilter, dateFilter]);

  const handleHideEntry = async (answerId: string) => {
    await createDeletionTombstone({
      targetType: 'wrong_book_item',
      targetId: answerId,
      mode: 'hide_wrong_book',
      reason: '使用者移出錯題複習清單（保留統計證據）',
      deviceId: settings.deviceId,
    });
    await reloadSnapshot();
    setNotice('已移出錯題複習清單，原始作答統計與掌握指標證據仍完整保留。');
  };

  const handleResetRecord = async (answerId: string) => {
    await createDeletionTombstone({
      targetType: 'answer_record',
      targetId: answerId,
      mode: 'reset_record',
      reason: '使用者重置此筆作答紀錄並重算統計',
      deviceId: settings.deviceId,
    });
    setConfirmResetId(null);
    await reloadSnapshot();
    setNotice('已重置此筆作答紀錄，掌握度與複習排程已同步重新計算。');
  };

  const handleRetrySet = async (setId: string) => {
    const targetSet = snapshot?.questionSets.find((s) => s.setId === setId);
    if (!targetSet) {
      setNotice('找不到原題組（可能已移除），請從題庫重新選擇題組。');
      return;
    }
    const run = createTestRun(targetSet, settings.deviceId);
    await recordTestRunStart(run);
    await reloadSnapshot();
    navigate(`/quiz/${run.testRunId}`);
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">錯題本與精準複習</h1>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--mc-text-secondary)' }}>
          僅收錄「已評閱且答錯」的紀錄（待 AI 判讀中的理解題絕不會列入錯題）。移出清單會保留統計，重置紀錄則會移除證據並重算。
        </p>
      </header>

      {/* Filters */}
      <section
        aria-label="錯題篩選"
        className="grid gap-3 rounded-2xl border p-4 sm:grid-cols-2 lg:grid-cols-4"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <label className="block text-xs space-y-1">
          <span style={{ color: 'var(--mc-text-muted)' }}>錯題狀態</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            className="w-full min-h-[40px] rounded-xl border px-3 py-1.5 text-xs"
            style={{
              backgroundColor: 'var(--mc-bg-elevated)',
              borderColor: 'var(--mc-border)',
              color: 'var(--mc-text-primary)',
            }}
          >
            <option value="active_wrong">仍待複習錯題</option>
            <option value="retried_passed">曾錯但後續重練已答對</option>
            <option value="all">全部歷史錯題紀錄</option>
          </select>
        </label>

        <label className="block text-xs space-y-1">
          <span style={{ color: 'var(--mc-text-muted)' }}>章節</span>
          <select
            value={chapterFilter}
            onChange={(e) => {
              setChapterFilter(e.target.value);
              setConceptFilter('all');
            }}
            className="w-full min-h-[40px] rounded-xl border px-3 py-1.5 text-xs"
            style={{
              backgroundColor: 'var(--mc-bg-elevated)',
              borderColor: 'var(--mc-border)',
              color: 'var(--mc-text-primary)',
            }}
          >
            <option value="all">全部章節</option>
            {CANONICAL_CHAPTERS.map((ch) => (
              <option key={ch.chapterId} value={ch.chapterId}>
                第 {ch.order} 章：{ch.titleZh}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs space-y-1">
          <span style={{ color: 'var(--mc-text-muted)' }}>概念</span>
          <select
            value={conceptFilter}
            onChange={(e) => setConceptFilter(e.target.value)}
            className="w-full min-h-[40px] rounded-xl border px-3 py-1.5 text-xs"
            style={{
              backgroundColor: 'var(--mc-bg-elevated)',
              borderColor: 'var(--mc-border)',
              color: 'var(--mc-text-primary)',
            }}
          >
            <option value="all">全部概念</option>
            {availableConcepts.map((c) => (
              <option key={c.conceptId} value={c.conceptId}>
                {c.titleZh}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs space-y-1">
          <span style={{ color: 'var(--mc-text-muted)' }}>時間範圍</span>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as typeof dateFilter)}
            className="w-full min-h-[40px] rounded-xl border px-3 py-1.5 text-xs"
            style={{
              backgroundColor: 'var(--mc-bg-elevated)',
              borderColor: 'var(--mc-border)',
              color: 'var(--mc-text-primary)',
            }}
          >
            <option value="all">全部時間</option>
            <option value="7d">近 7 天</option>
            <option value="30d">近 30 天</option>
          </select>
        </label>
      </section>

      {notice && (
        <div
          role="status"
          className="rounded-xl border px-4 py-2.5 text-xs"
          style={{
            backgroundColor: 'var(--mc-bg-elevated)',
            borderColor: 'var(--mc-accent)',
            color: 'var(--mc-text-primary)',
          }}
        >
          {notice}
        </div>
      )}

      {filtered.length === 0 ? (
        <div
          className="rounded-2xl border p-8 text-center text-sm"
          style={{
            backgroundColor: 'var(--mc-bg-secondary)',
            borderColor: 'var(--mc-border)',
            color: 'var(--mc-text-secondary)',
          }}
        >
          目前篩選條件下沒有錯題紀錄。
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => (
            <article
              key={item.answerId}
              className="rounded-2xl border p-5 space-y-3"
              style={{
                backgroundColor: 'var(--mc-bg-secondary)',
                borderColor: 'var(--mc-border)',
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs" style={{ color: 'var(--mc-text-muted)' }}>
                <span>
                  {item.chapterId.toUpperCase()} · {item.primaryConceptId} ·{' '}
                  {item.type === 'single_choice' ? '單選題' : '理解題'} ·{' '}
                  {new Date(item.submittedAt).toLocaleString('zh-TW')}
                </span>
                <span>同題歷史作答 {item.retryHistory.length} 次</span>
              </div>

              <p className="text-sm font-semibold leading-relaxed">{item.prompt}</p>
              {item.codeSnippet && <CSharpCodeBlock title="題目程式碼" code={item.codeSnippet} />}

              <div className="grid gap-3 md:grid-cols-2 text-xs">
                <div
                  className="rounded-xl border p-3"
                  style={{
                    backgroundColor: 'rgba(212,124,93,0.1)',
                    borderColor: '#d47c5d',
                  }}
                >
                  <p className="font-semibold" style={{ color: '#f5b482' }}>
                    當時回答：
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{item.userAnswerDisplay}</p>
                </div>
                <div
                  className="rounded-xl border p-3"
                  style={{
                    backgroundColor: 'rgba(70,150,115,0.1)',
                    borderColor: '#7fd1a8',
                  }}
                >
                  <p className="font-semibold" style={{ color: '#7fd1a8' }}>
                    正確答案／參考理解：
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{item.referenceAnswerDisplay}</p>
                </div>
              </div>

              <p className="text-xs leading-relaxed" style={{ color: 'var(--mc-text-secondary)' }}>
                <strong>解析：</strong>
                {item.explanation}
              </p>

              <div
                className="border-t pt-3 flex flex-wrap items-center justify-between gap-2 text-xs"
                style={{ borderColor: 'var(--mc-border)' }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {!item.hiddenFromWrongBook && (
                    <button
                      type="button"
                      onClick={() => void handleHideEntry(item.answerId)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 py-1.5 hover:bg-white/5"
                      style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-secondary)' }}
                    >
                      <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>移出複習清單 (保留統計)</span>
                    </button>
                  )}

                  {confirmResetId === item.answerId ? (
                    <div className="flex items-center gap-2">
                      <span style={{ color: '#f5b482' }}>確定移除此筆作答證據並重算？</span>
                      <button
                        type="button"
                        onClick={() => void handleResetRecord(item.answerId)}
                        className="rounded-lg bg-red-900/60 px-3 py-1.5 font-medium text-red-100"
                      >
                        確認重置
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmResetId(null)}
                        className="rounded-lg border px-3 py-1.5"
                        style={{ borderColor: 'var(--mc-border)' }}
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmResetId(item.answerId)}
                      className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 py-1.5 hover:bg-white/5"
                      style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-muted)' }}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>重置此筆作答紀錄</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void handleRetrySet(item.setId)}
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl px-3.5 py-1.5 font-semibold"
                  style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
                >
                  <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>重練原題組</span>
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {wrongBookEntries.length > 0 && statusFilter !== 'all' && filtered.length === 0 && (
        <div className="text-center">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className="inline-flex items-center gap-1.5 text-xs hover:underline"
            style={{ color: 'var(--mc-accent)' }}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>檢視全部歷史錯題紀錄</span>
          </button>
        </div>
      )}
    </div>
  );
};
