/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { StudyProvider } from './context/StudyContext.tsx';
import { AiWorkbenchPage } from './features/AiWorkbenchPage.tsx';
import { ChapterSlidesPage } from './features/ChapterSlidesPage.tsx';
import { HomePage } from './features/HomePage.tsx';
import { MasteryPage } from './features/MasteryPage.tsx';
import { QuestionBankPage } from './features/QuestionBankPage.tsx';
import { QuizResultPage } from './features/QuizResultPage.tsx';
import { QuizRunnerPage } from './features/QuizRunnerPage.tsx';
import { SettingsPage } from './features/SettingsPage.tsx';
import { StorageVersionsPage } from './features/StorageVersionsPage.tsx';
import { SystemDocsPage } from './features/SystemDocsPage.tsx';
import { WrongBookPage } from './features/WrongBookPage.tsx';

export default function App() {
  return (
    <ErrorBoundary>
      <StudyProvider>
        <HashRouter>
          <AppShell>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/chapters/:chapterId" element={<ChapterSlidesPage />} />
              <Route path="/bank" element={<QuestionBankPage />} />
              <Route path="/quiz/:testRunId" element={<QuizRunnerPage />} />
              <Route path="/quiz/:testRunId/result" element={<QuizResultPage />} />
              <Route path="/wrong-book" element={<WrongBookPage />} />
              <Route path="/mastery" element={<MasteryPage />} />
              <Route path="/ai" element={<AiWorkbenchPage />} />
              <Route path="/storage" element={<StorageVersionsPage />} />
              <Route path="/docs" element={<SystemDocsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </AppShell>
        </HashRouter>
      </StudyProvider>
    </ErrorBoundary>
  );
}
