import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle2,
  Edit3,
  Layers,
  Play,
  RotateCcw,
  SkipBack,
  SkipForward,
} from 'lucide-react';
import { CANONICAL_CHAPTERS, CHAPTERS_BY_ID } from '../data/curriculum/index.ts';
import { CSharpCodeBlock } from '../components/CSharpCodeBlock.tsx';
import { useStudy } from '../context/StudyContext.tsx';
import { generateUuid } from '../domain/hash.ts';
import type { SlideLayoutVariant, SlideVariant } from '../domain/types.ts';
import { revertSlideVariantsForSlide, saveSlideVariant } from '../storage/studyStore.ts';

export const ChapterSlidesPage: React.FC = () => {
  const { chapterId = 'ch1' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { settings, snapshot, reloadSnapshot } = useStudy();

  const chapter = CHAPTERS_BY_ID.get(chapterId) ?? CANONICAL_CHAPTERS[0];
  const [slideIdx, setSlideIdx] = useState(0);
  const [simStepIdx, setSimStepIdx] = useState(0);
  const [viewMode, setViewMode] = useState<'variant' | 'canonical'>('variant');
  const [editing, setEditing] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // Sync slide index when URL ?slide=... or chapterId changes
  useEffect(() => {
    const requestedSlideId = searchParams.get('slide');
    if (requestedSlideId) {
      const found = chapter.slides.findIndex((s) => s.slideId === requestedSlideId);
      setSlideIdx(found >= 0 ? found : 0);
    } else {
      setSlideIdx(0);
    }
    setSimStepIdx(0);
    setEditing(false);
    setSaveFeedback(null);
  }, [chapter.chapterId, chapter.slides, searchParams]);

  const currentSlide = chapter.slides[slideIdx] ?? chapter.slides[0];

  const latestVariant = useMemo<SlideVariant | null>(() => {
    if (!snapshot) return null;
    const matches = snapshot.slideVariants
      .filter((v) => v.slideId === currentSlide.slideId)
      .sort((a, b) => b.updatedRevision - a.updatedRevision);
    return matches[0] ?? null;
  }, [snapshot, currentSlide.slideId]);

  const showVariant = viewMode === 'variant' && latestVariant !== null;

  const effectiveAnalogy =
    showVariant && latestVariant?.analogy ? latestVariant.analogy : currentSlide.editable.analogy;
  const effectivePlain =
    showVariant && latestVariant?.plainExplanation
      ? latestVariant.plainExplanation
      : currentSlide.editable.plainExplanation;
  const effectiveDetailLevel =
    showVariant && latestVariant?.detailLevel
      ? latestVariant.detailLevel
      : currentSlide.editable.detailLevel;
  const effectiveLayout: SlideLayoutVariant =
    showVariant && latestVariant?.layoutVariant
      ? latestVariant.layoutVariant
      : currentSlide.editable.layoutVariant;

  // Editable form state
  const [draftStory, setDraftStory] = useState(effectiveAnalogy.story);
  const [draftMapping, setDraftMapping] = useState(effectiveAnalogy.mapping);
  const [draftBoundary, setDraftBoundary] = useState(effectiveAnalogy.boundary);
  const [draftPlain, setDraftPlain] = useState(effectivePlain);
  const [draftDetail, setDraftDetail] = useState(effectiveDetailLevel);
  const [draftLayout, setDraftLayout] = useState<SlideLayoutVariant>(effectiveLayout);

  useEffect(() => {
    setDraftStory(effectiveAnalogy.story);
    setDraftMapping(effectiveAnalogy.mapping);
    setDraftBoundary(effectiveAnalogy.boundary);
    setDraftPlain(effectivePlain);
    setDraftDetail(effectiveDetailLevel);
    setDraftLayout(effectiveLayout);
  }, [
    currentSlide.slideId,
    effectiveAnalogy.boundary,
    effectiveAnalogy.mapping,
    effectiveAnalogy.story,
    effectiveDetailLevel,
    effectiveLayout,
    effectivePlain,
  ]);

  // Keyboard navigation between slides
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowRight' && slideIdx < chapter.slides.length - 1) {
        setSlideIdx((i) => i + 1);
        setSimStepIdx(0);
      } else if (e.key === 'ArrowLeft' && slideIdx > 0) {
        setSlideIdx((i) => i - 1);
        setSimStepIdx(0);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chapter.slides.length, slideIdx]);

  const handleSaveUserEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    const variant: SlideVariant = {
      format: 'mooncode.slide_variant',
      schemaVersion: 1,
      variantId: generateUuid(),
      slideId: currentSlide.slideId,
      chapterId: chapter.chapterId,
      baseContentVersion: currentSlide.contentVersion,
      mode: 'presentation_only',
      analogy: {
        story: draftStory.trim() || currentSlide.editable.analogy.story,
        mapping: draftMapping.trim() || currentSlide.editable.analogy.mapping,
        boundary: draftBoundary.trim() || currentSlide.editable.analogy.boundary,
      },
      plainExplanation: draftPlain.trim() || currentSlide.editable.plainExplanation,
      detailLevel: draftDetail,
      layoutVariant: draftLayout,
      source: 'user',
      savedAt: new Date().toISOString(),
      updatedRevision: (latestVariant?.updatedRevision ?? 0) + 1,
    };
    await saveSlideVariant(variant);
    await reloadSnapshot();
    setViewMode('variant');
    setEditing(false);
    setSaveFeedback('已安全儲存個人改寫版（核心定義與程式碼保持原樣）。');
  };

  const handleRevertToCanonical = async () => {
    await revertSlideVariantsForSlide(currentSlide.slideId, settings.deviceId);
    await reloadSnapshot();
    setEditing(false);
    setSaveFeedback('已透過 Tombstone 還原為原版教材。');
  };

  const sim = currentSlide.simulation;
  const activeSimStep = sim ? sim.steps[simStepIdx] ?? sim.steps[0] : null;
  const isComparisonLayout = effectiveLayout === 'comparison_columns';
  const isFocusedLayout = effectiveLayout === 'focused_concept';

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Chapter Header & Controls */}
      <div
        className="rounded-2xl border p-5"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-medium" style={{ color: 'var(--mc-text-muted)' }}>
              第 {chapter.order} 章 · {chapter.titleEn} · 情境：{chapter.scenarioTitle}
            </p>
            <h1 className="mt-1 text-xl sm:text-2xl font-semibold tracking-tight">
              {chapter.titleZh}
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="快速切換章節"
              value={chapter.chapterId}
              onChange={(e) => navigate(`/chapters/${e.target.value}`)}
              className="min-h-[40px] rounded-xl border px-3 py-1.5 text-xs"
              style={{
                backgroundColor: 'var(--mc-bg-elevated)',
                borderColor: 'var(--mc-border)',
                color: 'var(--mc-text-primary)',
              }}
            >
              {CANONICAL_CHAPTERS.map((ch) => (
                <option key={ch.chapterId} value={ch.chapterId}>
                  第 {ch.order} 章：{ch.titleZh}
                </option>
              ))}
            </select>
            <Link
              to={`/bank?chapter=${chapter.chapterId}`}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold"
              style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
            >
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              <span>做本章測驗</span>
            </Link>
          </div>
        </div>

        {/* Slide Stepper */}
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4" style={{ borderColor: 'var(--mc-border)' }}>
          {chapter.slides.map((s, idx) => {
            const active = idx === slideIdx;
            return (
              <button
                key={s.slideId}
                type="button"
                onClick={() => {
                  setSlideIdx(idx);
                  setSimStepIdx(0);
                  setSaveFeedback(null);
                }}
                className="min-h-[36px] rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: active ? 'var(--mc-accent)' : 'var(--mc-bg-elevated)',
                  color: active ? 'var(--mc-accent-text)' : 'var(--mc-text-secondary)',
                  borderColor: active ? 'var(--mc-accent)' : 'var(--mc-border)',
                }}
              >
                {idx + 1}. {s.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Presentation Mode Bar (Canonical vs Variant + Safe Edit + AI Rewrite) */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs"
        style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span style={{ color: 'var(--mc-text-muted)' }}>
            簡報 {slideIdx + 1} / {chapter.slides.length} · 教材基準 v{currentSlide.contentVersion}
          </span>
          {latestVariant && (
            <div className="inline-flex rounded-lg border p-0.5" style={{ borderColor: 'var(--mc-border)' }}>
              <button
                type="button"
                onClick={() => setViewMode('variant')}
                className="rounded-md px-2.5 py-1 font-medium"
                style={{
                  backgroundColor: viewMode === 'variant' ? 'var(--mc-bg-elevated)' : 'transparent',
                  color: viewMode === 'variant' ? 'var(--mc-text-primary)' : 'var(--mc-text-muted)',
                }}
              >
                個人／AI 改寫版 (rev {latestVariant.updatedRevision})
              </button>
              <button
                type="button"
                onClick={() => setViewMode('canonical')}
                className="rounded-md px-2.5 py-1 font-medium"
                style={{
                  backgroundColor: viewMode === 'canonical' ? 'var(--mc-bg-elevated)' : 'transparent',
                  color: viewMode === 'canonical' ? 'var(--mc-text-primary)' : 'var(--mc-text-muted)',
                }}
              >
                原版教材
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 py-1.5 hover:bg-white/5"
            style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-secondary)' }}
          >
            <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{editing ? '取消微調' : '自訂比喻與版面'}</span>
          </button>

          {latestVariant && (
            <button
              type="button"
              onClick={() => void handleRevertToCanonical()}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 py-1.5 hover:bg-white/5"
              style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-secondary)' }}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>還原原版</span>
            </button>
          )}

          <Link
            to={`/ai?task=rewrite_slide&chapterId=${chapter.chapterId}&slideId=${currentSlide.slideId}`}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-3 py-1.5 hover:bg-white/5"
            style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-accent)' }}
          >
            <Bot className="h-3.5 w-3.5" aria-hidden="true" />
            <span>請 ChatGPT Plus 改寫比喻</span>
          </Link>
        </div>
      </div>

      {saveFeedback && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs"
          style={{
            backgroundColor: 'var(--mc-bg-elevated)',
            borderColor: 'var(--mc-accent)',
            color: 'var(--mc-text-primary)',
          }}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: 'var(--mc-accent)' }} aria-hidden="true" />
          <span>{saveFeedback}</span>
        </div>
      )}

      {/* Controlled Editable Form (Locked fields cannot be edited!) */}
      {editing && (
        <form
          onSubmit={handleSaveUserEdit}
          className="space-y-4 rounded-2xl border p-5"
          style={{ backgroundColor: 'var(--mc-bg-elevated)', borderColor: 'var(--mc-border)' }}
        >
          <div>
            <h2 className="text-sm font-semibold">僅可微調比喻、白話說明與呈現版面</h2>
            <p className="mt-1 text-xs" style={{ color: 'var(--mc-text-muted)' }}>
              受保護欄位（核心定義、C# 程式碼、程式預期行為、學習目標、評閱依據）已鎖定不可更動。
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-xs space-y-1">
              <span style={{ color: 'var(--mc-text-secondary)' }}>生活比喻故事 (analogy.story)</span>
              <textarea
                rows={3}
                value={draftStory}
                onChange={(e) => setDraftStory(e.target.value)}
                className="w-full rounded-xl border p-2.5 text-sm"
                style={{
                  backgroundColor: 'var(--mc-bg-primary)',
                  borderColor: 'var(--mc-border)',
                  color: 'var(--mc-text-primary)',
                }}
              />
            </label>
            <label className="block text-xs space-y-1">
              <span style={{ color: 'var(--mc-text-secondary)' }}>精確概念對照 (analogy.mapping)</span>
              <textarea
                rows={3}
                value={draftMapping}
                onChange={(e) => setDraftMapping(e.target.value)}
                className="w-full rounded-xl border p-2.5 text-sm"
                style={{
                  backgroundColor: 'var(--mc-bg-primary)',
                  borderColor: 'var(--mc-border)',
                  color: 'var(--mc-text-primary)',
                }}
              />
            </label>
            <label className="block text-xs space-y-1">
              <span style={{ color: 'var(--mc-text-secondary)' }}>比喻適用邊界 (analogy.boundary)</span>
              <textarea
                rows={2}
                value={draftBoundary}
                onChange={(e) => setDraftBoundary(e.target.value)}
                className="w-full rounded-xl border p-2.5 text-sm"
                style={{
                  backgroundColor: 'var(--mc-bg-primary)',
                  borderColor: 'var(--mc-border)',
                  color: 'var(--mc-text-primary)',
                }}
              />
            </label>
            <label className="block text-xs space-y-1">
              <span style={{ color: 'var(--mc-text-secondary)' }}>白話補充說明 (plainExplanation)</span>
              <textarea
                rows={2}
                value={draftPlain}
                onChange={(e) => setDraftPlain(e.target.value)}
                className="w-full rounded-xl border p-2.5 text-sm"
                style={{
                  backgroundColor: 'var(--mc-bg-primary)',
                  borderColor: 'var(--mc-border)',
                  color: 'var(--mc-text-primary)',
                }}
              />
            </label>
            <label className="block text-xs space-y-1">
              <span style={{ color: 'var(--mc-text-secondary)' }}>講解詳盡層級</span>
              <select
                value={draftDetail}
                onChange={(e) => setDraftDetail(e.target.value as 'concise' | 'standard' | 'detailed')}
                className="w-full rounded-xl border px-3 py-2 text-sm"
                style={{
                  backgroundColor: 'var(--mc-bg-primary)',
                  borderColor: 'var(--mc-border)',
                  color: 'var(--mc-text-primary)',
                }}
              >
                <option value="concise">精簡版</option>
                <option value="standard">標準版</option>
                <option value="detailed">詳盡版</option>
              </select>
            </label>
            <label className="block text-xs space-y-1">
              <span style={{ color: 'var(--mc-text-secondary)' }}>簡報呈現布局</span>
              <select
                value={draftLayout}
                onChange={(e) => setDraftLayout(e.target.value as SlideLayoutVariant)}
                className="w-full rounded-xl border px-3 py-2 text-sm"
                style={{
                  backgroundColor: 'var(--mc-bg-primary)',
                  borderColor: 'var(--mc-border)',
                  color: 'var(--mc-text-primary)',
                }}
              >
                <option value="split_code">雙欄解說與程式碼並排 (split_code)</option>
                <option value="focused_concept">單欄聚焦專注閱讀 (focused_concept)</option>
                <option value="comparison_columns">對照整理視圖 (comparison_columns)</option>
              </select>
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="min-h-[40px] rounded-xl border px-4 py-2 text-xs"
              style={{ borderColor: 'var(--mc-border)' }}
            >
              取消
            </button>
            <button
              type="submit"
              className="min-h-[40px] rounded-xl px-4 py-2 text-xs font-semibold"
              style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
            >
              儲存改寫版
            </button>
          </div>
        </form>
      )}

      {/* Main Slide Body */}
      <article
        className={`grid gap-6 ${
          isFocusedLayout ? 'grid-cols-1 max-w-4xl mx-auto' : 'grid-cols-1 lg:grid-cols-12'
        }`}
      >
        {/* Narrative Column */}
        <div className={`${isFocusedLayout ? '' : 'lg:col-span-6'} space-y-4 min-w-0`}>
          {/* Core Point & Locked Definition */}
          <div
            className="rounded-2xl border p-5 space-y-3"
            style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
          >
            <div className="flex items-center justify-between gap-2 text-xs" style={{ color: 'var(--mc-text-muted)' }}>
              <span>核心結論</span>
              <span>原版核心鎖定區</span>
            </div>
            <h2 className="text-lg font-semibold leading-snug">{currentSlide.title}</h2>
            <p className="text-sm font-medium leading-relaxed" style={{ color: 'var(--mc-accent)' }}>
              {currentSlide.corePoint}
            </p>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--mc-text-secondary)' }}>
              {currentSlide.locked.definition}
            </p>

            {/* Term Mappings */}
            {currentSlide.locked.termMappings.length > 0 && (
              <div className="border-t pt-3 space-y-2" style={{ borderColor: 'var(--mc-border)' }}>
                <p className="text-xs font-medium" style={{ color: 'var(--mc-text-muted)' }}>
                  關鍵專有名詞對照
                </p>
                <dl className="space-y-1.5 text-xs">
                  {currentSlide.locked.termMappings.map((tm, i) => (
                    <div key={i} className="flex flex-wrap gap-1.5">
                      <dt className="font-semibold" style={{ color: 'var(--mc-text-primary)' }}>
                        {tm.termZh} ({tm.termEn})：
                      </dt>
                      <dd style={{ color: 'var(--mc-text-secondary)' }}>{tm.meaning}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>

          {/* Editable Analogy & Plain Explanation */}
          <div
            className={`rounded-2xl border p-5 space-y-3 ${
              isComparisonLayout ? 'grid sm:grid-cols-2 gap-4 space-y-0' : ''
            }`}
            style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
          >
            <div className="space-y-2">
              <p className="text-xs font-medium" style={{ color: 'var(--mc-text-muted)' }}>
                白話講解（{effectiveDetailLevel === 'concise' ? '精簡' : effectiveDetailLevel === 'detailed' ? '詳盡' : '標準'}）
              </p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--mc-text-primary)' }}>
                {effectivePlain}
              </p>
            </div>

            <div
              className={`space-y-2 ${isComparisonLayout ? '' : 'border-t pt-3'}`}
              style={{ borderColor: 'var(--mc-border)' }}
            >
              <p className="text-xs font-medium" style={{ color: 'var(--mc-text-muted)' }}>
                生活比喻與適用邊界
              </p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--mc-text-secondary)' }}>
                {effectiveAnalogy.story}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--mc-text-secondary)' }}>
                <strong style={{ color: 'var(--mc-text-primary)' }}>程式對照：</strong>
                {effectiveAnalogy.mapping}
              </p>
              <p className="text-xs leading-relaxed" style={{ color: '#e6c38d' }}>
                <strong>比喻邊界（不可過度類比）：</strong>
                {effectiveAnalogy.boundary}
              </p>
            </div>
          </div>

          {/* Locked Expected Behavior & Learning Objectives */}
          <div
            className="rounded-2xl border p-5 space-y-3"
            style={{ backgroundColor: 'var(--mc-bg-secondary)', borderColor: 'var(--mc-border)' }}
          >
            <p className="text-xs font-medium" style={{ color: 'var(--mc-text-muted)' }}>
              程式預期行為與學習目標（判分依據）
            </p>
            <ul className="list-disc pl-5 space-y-1 text-xs leading-relaxed" style={{ color: 'var(--mc-text-secondary)' }}>
              {currentSlide.locked.expectedBehavior.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
            <div className="border-t pt-2.5 text-xs" style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-muted)' }}>
              目標：{currentSlide.locked.learningObjectives.join(' · ')}
            </div>
          </div>
        </div>

        {/* C# Code + Step Simulation Column */}
        <div className={`${isFocusedLayout ? '' : 'lg:col-span-6'} space-y-4 min-w-0`}>
          <CSharpCodeBlock
            title={currentSlide.locked.codeTitle}
            code={currentSlide.locked.code}
            highlightLine={activeSimStep?.highlightLine}
          />

          {sim && activeSimStep && (
            <section
              aria-label="步驟模擬與結果推演"
              className="rounded-2xl border p-5 space-y-3"
              style={{ backgroundColor: 'var(--mc-bg-elevated)', borderColor: 'var(--mc-border)' }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-semibold" style={{ color: 'var(--mc-accent)' }}>
                    {sim.modeLabel}
                  </span>
                  <h3 className="text-sm font-semibold mt-0.5">{sim.title}</h3>
                </div>
                <span className="text-xs tabular-nums" style={{ color: 'var(--mc-text-muted)' }}>
                  步驟 {simStepIdx + 1} / {sim.steps.length}
                </span>
              </div>

              <div
                className="rounded-xl border p-3.5 space-y-2.5"
                style={{ backgroundColor: 'var(--mc-bg-primary)', borderColor: 'var(--mc-border)' }}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold" style={{ color: 'var(--mc-text-primary)' }}>
                    {activeSimStep.stepLabel}
                  </span>
                  <span style={{ color: 'var(--mc-text-muted)' }}>主體：{activeSimStep.actor}</span>
                </div>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--mc-text-secondary)' }}>
                  {activeSimStep.explanation}
                </p>

                <div className="grid gap-2 sm:grid-cols-2 pt-1">
                  {Object.entries(activeSimStep.stateSnapshot).map(([k, v]) => (
                    <div
                      key={k}
                      className="rounded-lg border px-2.5 py-1.5 text-xs font-mono"
                      style={{
                        backgroundColor: 'var(--mc-bg-secondary)',
                        borderColor: 'var(--mc-border)',
                      }}
                    >
                      <span style={{ color: 'var(--mc-text-muted)' }}>{k}: </span>
                      <span style={{ color: 'var(--mc-text-primary)' }}>{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={simStepIdx === 0}
                    onClick={() => setSimStepIdx((s) => Math.max(0, s - 1))}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-40"
                    style={{ borderColor: 'var(--mc-border)' }}
                  >
                    <SkipBack className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>上一步</span>
                  </button>
                  <button
                    type="button"
                    disabled={simStepIdx >= sim.steps.length - 1}
                    onClick={() => setSimStepIdx((s) => Math.min(sim.steps.length - 1, s + 1))}
                    className="inline-flex min-h-[38px] items-center gap-1 rounded-lg px-3.5 py-1.5 text-xs font-semibold disabled:opacity-40"
                    style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
                  >
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{simStepIdx === 0 ? sim.initialActionLabel : '下一步推演'}</span>
                    <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setSimStepIdx(0)}
                  className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border px-3 py-1.5 text-xs"
                  style={{ borderColor: 'var(--mc-border)', color: 'var(--mc-text-muted)' }}
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>重設</span>
                </button>
              </div>
              <p className="text-[11px]" style={{ color: 'var(--mc-text-muted)' }}>
                註：本互動為預定義步驟模擬／結果推演，供觀察物件與資料流動；瀏覽器端不執行真實 C# 編譯器。
              </p>
            </section>
          )}
        </div>
      </article>

      {/* Bottom Slide Prev / Next */}
      <div
        className="flex items-center justify-between gap-4 border-t pt-4"
        style={{ borderColor: 'var(--mc-border)' }}
      >
        <button
          type="button"
          disabled={slideIdx === 0}
          onClick={() => {
            setSlideIdx((i) => Math.max(0, i - 1));
            setSimStepIdx(0);
          }}
          className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border px-4 py-2 text-sm disabled:opacity-40"
          style={{ borderColor: 'var(--mc-border)', backgroundColor: 'var(--mc-bg-secondary)' }}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span>上一頁簡報</span>
        </button>

        {slideIdx < chapter.slides.length - 1 ? (
          <button
            type="button"
            onClick={() => {
              setSlideIdx((i) => Math.min(chapter.slides.length - 1, i + 1));
              setSimStepIdx(0);
            }}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold"
            style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
          >
            <span>下一頁簡報</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : (
          <Link
            to={`/bank?chapter=${chapter.chapterId}`}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold"
            style={{ backgroundColor: 'var(--mc-accent)', color: 'var(--mc-accent-text)' }}
          >
            <span>完成本章簡報，前往第 {chapter.order} 章題組測驗</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
};
