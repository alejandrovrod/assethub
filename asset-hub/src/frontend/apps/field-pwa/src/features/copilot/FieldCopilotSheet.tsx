import { Fragment, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Loader2,
  Mic,
  Send,
  ShieldAlert,
  Sparkles,
  Square,
  WifiOff,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  askAssetCopilot,
  getAssetCopilotManuals,
  resolveManualUrl,
  type AssetCopilotManualsResponse,
  type CopilotConversationTurn,
  type FieldCopilotCitation,
} from './field-copilot.api';

interface Props {
  assetId: string;
  assetCode: string;
  assetName: string;
  onClose: () => void;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  usedVoiceInput?: boolean;
  foundInManuals?: boolean;
  citations?: FieldCopilotCitation[];
  safetyWarnings?: string[];
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

function getSpeechRecognitionConstructor(): (new () => SpeechRecognitionLike) | null {
  const win = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(new Error('Failed to read audio recording'));
    reader.readAsDataURL(blob);
  });
}

function renderInlineFormatting(text: string): React.ReactNode {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return tokens.map((token, idx) => {
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code
          key={idx}
          className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={idx}>{token}</Fragment>;
  });
}

function StructuredAnswerText({ text }: { text: string }) {
  const lines = text.split(/\r?\n/);
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={idx} className="h-1" />;
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} className="flex gap-2 pl-0.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
              <span>{renderInlineFormatting(trimmed.slice(2))}</span>
            </div>
          );
        }
        return <p key={idx}>{renderInlineFormatting(trimmed)}</p>;
      })}
    </div>
  );
}

export function FieldCopilotSheet({
  assetId,
  assetCode,
  assetName,
  onClose,
}: Props) {
  const { t, i18n } = useTranslation('assets');
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [manualsData, setManualsData] = useState<AssetCopilotManualsResponse | null>(null);
  const [isLoadingManuals, setIsLoadingManuals] = useState(false);
  const [showManualsList, setShowManualsList] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [isAsking, setIsAsking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [expandedSnippetKey, setExpandedSnippetKey] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState<'idle' | 'dictating' | 'recording'>('idle');

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    if (!isOnline || !assetId) return;
    let cancelled = false;
    setIsLoadingManuals(true);
    getAssetCopilotManuals(assetId)
      .then((res) => {
        if (!cancelled) setManualsData(res);
      })
      .catch(() => {
        // Non-blocking: user can still submit a question
      })
      .finally(() => {
        if (!cancelled) setIsLoadingManuals(false);
      });
    return () => {
      cancelled = true;
    };
  }, [assetId, isOnline]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isAsking]);

  const stopVoiceCapture = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // Ignore already stopped recognition
    }
    recognitionRef.current = null;

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        // Ignore recorder stop race
      }
    }
    mediaRecorderRef.current = null;

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    setVoiceMode('idle');
  };

  useEffect(() => () => stopVoiceCapture(), []);

  const submitQuestion = async (vars: {
    promptText?: string;
    audioBase64?: string;
    audioMimeType?: string;
  }) => {
    if (!isOnline || isAsking) return;
    setErrorMsg(null);
    setIsAsking(true);

    try {
      const history: CopilotConversationTurn[] = messages.slice(-6).map((m) => ({
        role: m.role,
        text: m.text,
      }));
      const lang = i18n.language?.toLowerCase().startsWith('en') ? 'en' : 'es';

      const res = await askAssetCopilot(assetId, {
        question: vars.promptText,
        audioBase64: vars.audioBase64,
        audioMimeType: vars.audioMimeType,
        history,
        preferredLanguage: lang,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `model-${Date.now()}`,
          role: 'model',
          text: res.answer,
          foundInManuals: res.foundInManuals,
          citations: res.citations,
          safetyWarnings: res.safetyWarnings,
        },
      ]);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : t('copilot.askError'));
    } finally {
      setIsAsking(false);
    }
  };

  const handleSendText = (customPrompt?: string) => {
    const trimmed = (customPrompt ?? question).trim();
    if (!trimmed || isAsking || !isOnline) return;
    if (voiceMode !== 'idle') stopVoiceCapture();

    setMessages((prev) => [
      ...prev,
      { id: `user-${Date.now()}`, role: 'user', text: trimmed },
    ]);
    if (!customPrompt) setQuestion('');
    void submitQuestion({ promptText: trimmed });
  };

  const handleToggleVoice = async () => {
    if (!isOnline || isAsking) return;
    if (voiceMode !== 'idle') {
      stopVoiceCapture();
      return;
    }
    setErrorMsg(null);

    const SpeechRec = getSpeechRecognitionConstructor();
    if (SpeechRec) {
      try {
        const recognition = new SpeechRec();
        recognition.lang = i18n.language?.toLowerCase().startsWith('en') ? 'en-US' : 'es-ES';
        recognition.interimResults = false;
        recognition.continuous = false;
        recognition.onresult = (event) => {
          const transcript = Array.from(event.results)
            .map((r) => r[0]?.transcript ?? '')
            .join(' ')
            .trim();
          if (transcript) {
            setQuestion((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
          }
        };
        recognition.onerror = () => {
          setVoiceMode('idle');
          setErrorMsg(t('copilot.micError'));
        };
        recognition.onend = () => {
          recognitionRef.current = null;
          setVoiceMode('idle');
        };
        recognitionRef.current = recognition;
        setVoiceMode('dictating');
        recognition.start();
        return;
      } catch {
        setVoiceMode('idle');
      }
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setErrorMsg(t('copilot.micUnsupported'));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunks.push(ev.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        setVoiceMode('idle');

        if (chunks.length === 0) return;
        const resolvedMime = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: resolvedMime });
        try {
          const base64 = await blobToBase64(blob);
          setMessages((prev) => [
            ...prev,
            {
              id: `user-voice-${Date.now()}`,
              role: 'user',
              text: t('copilot.voiceMessageLabel'),
              usedVoiceInput: true,
            },
          ]);
          void submitQuestion({ audioBase64: base64, audioMimeType: resolvedMime });
        } catch {
          setErrorMsg(t('copilot.micError'));
        }
      };

      mediaRecorderRef.current = recorder;
      setVoiceMode('recording');
      recorder.start();
    } catch {
      setErrorMsg(t('copilot.micPermissionDenied'));
      stopVoiceCapture();
    }
  };

  const quickPrompts = [
    t('copilot.quickPrompts.torque'),
    t('copilot.quickPrompts.bleeding'),
    t('copilot.quickPrompts.safety'),
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <header className="shrink-0 border-b bg-card px-4 pb-3 pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-primary" />
              <h2 className="truncate text-base font-bold">{t('copilot.title')}</h2>
              {assetCode && (
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                  {assetCode}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {assetName || assetId}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              stopVoiceCapture();
              onClose();
            }}
            aria-label={t('copilot.close')}
            className="rounded-full p-2 transition hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isOnline && (
          <div className="mt-2.5">
            <button
              type="button"
              onClick={() => setShowManualsList((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1 text-xs font-medium"
            >
              <BookOpen className="h-3.5 w-3.5 text-primary" />
              {isLoadingManuals ? (
                <span>{t('copilot.loadingManuals')}</span>
              ) : (
                <span>
                  {t('copilot.manualsCount', {
                    count: manualsData?.totalManualsCount ?? 0,
                  })}
                </span>
              )}
              {showManualsList ? (
                <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </button>

            {showManualsList && manualsData && (
              <div className="mt-2 max-h-32 space-y-1 overflow-y-auto rounded-lg border bg-background p-2">
                {manualsData.manuals.length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('copilot.noManualsHint')}</p>
                ) : (
                  manualsData.manuals.map((m) => (
                    <div
                      key={m.fileHash}
                      className="flex items-center justify-between gap-2 text-xs py-0.5"
                    >
                      <span className="flex min-w-0 items-center gap-1.5 truncate">
                        <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
                        <span className="truncate">{m.fileName}</span>
                      </span>
                      {m.downloadUrl && (
                        <a
                          href={resolveManualUrl(m.downloadUrl)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0 text-primary"
                          aria-label={m.fileName}
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </header>

      {/* Body */}
      <main className="flex-1 overflow-y-auto p-4 space-y-3">
        {!isOnline ? (
          <div className="rounded-2xl border border-dashed p-6 text-center space-y-2 mt-8">
            <div className="flex justify-center">
              <WifiOff className="h-8 w-8 text-amber-600" />
            </div>
            <h3 className="text-sm font-bold">{t('copilot.offlineTitle')}</h3>
            <p className="text-xs text-muted-foreground">{t('copilot.offlineHint')}</p>
          </div>
        ) : (
          <>
            {manualsData && manualsData.totalManualsCount === 0 && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <p className="font-semibold">{t('copilot.emptyManualsTitle')}</p>
                <p className="mt-0.5">{t('copilot.noManualsHint')}</p>
              </div>
            )}

            {errorMsg && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                {errorMsg}
              </div>
            )}

            {messages.length === 0 ? (
              <div className="space-y-3 pt-4">
                <div className="rounded-2xl border bg-muted/30 p-4 text-center space-y-1.5">
                  <BookOpen className="mx-auto h-6 w-6 text-primary" />
                  <h3 className="text-sm font-semibold">{t('copilot.emptyChatTitle')}</h3>
                  <p className="text-xs text-muted-foreground">
                    {t('copilot.emptyChatDescription')}
                  </p>
                </div>

                <div className="space-y-2">
                  {quickPrompts.map((qp, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={isAsking}
                      onClick={() => handleSendText(qp)}
                      className="w-full rounded-xl border bg-card px-3.5 py-2.5 text-left text-xs font-medium active:bg-muted disabled:opacity-50"
                    >
                      {qp}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  }`}
                >
                  <div
                    className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground text-sm'
                        : 'border bg-card text-foreground space-y-2.5'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <div className="flex items-center gap-1.5">
                        {msg.usedVoiceInput && <Mic className="h-3.5 w-3.5 shrink-0" />}
                        <span>{msg.text}</span>
                      </div>
                    ) : (
                      <>
                        {msg.safetyWarnings && msg.safetyWarnings.length > 0 && (
                          <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                            <div className="flex items-center gap-1.5 font-semibold mb-1">
                              <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
                              <span>{t('copilot.safetyBannerTitle')}</span>
                            </div>
                            <ul className="list-disc pl-4 space-y-0.5">
                              {msg.safetyWarnings.map((w, i) => (
                                <li key={i}>{w}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {msg.foundInManuals === false && (
                          <div className="inline-flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                            <AlertTriangle className="h-3 w-3" />
                            <span>{t('copilot.notFoundBadge')}</span>
                          </div>
                        )}

                        <StructuredAnswerText text={msg.text} />

                        {msg.citations && msg.citations.length > 0 && (
                          <div className="border-t pt-2 space-y-1.5">
                            <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                              <span>{t('copilot.citationsTitle')}</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {msg.citations.map((cit, cIdx) => {
                                const citKey = `${msg.id}-${cIdx}`;
                                const isExpanded = expandedSnippetKey === citKey;
                                const href = cit.downloadUrl
                                  ? `${resolveManualUrl(cit.downloadUrl)}${
                                      cit.pageNumber ? `#page=${cit.pageNumber}` : ''
                                    }`
                                  : null;

                                return (
                                  <div key={citKey} className="flex items-center gap-1">
                                    {href ? (
                                      <a
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 rounded-lg border bg-muted/60 px-2 py-1 text-[11px] font-medium text-primary"
                                      >
                                        <FileText className="h-3 w-3 shrink-0" />
                                        <span className="max-w-[140px] truncate">
                                          {cit.fileName}
                                        </span>
                                        {cit.pageNumber && (
                                          <span className="rounded bg-primary/10 px-1 text-[10px] font-bold">
                                            {t('copilot.pageShort', { page: cit.pageNumber })}
                                          </span>
                                        )}
                                        <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                                      </a>
                                    ) : (
                                      <span className="inline-flex items-center gap-1 rounded-lg border bg-muted/60 px-2 py-1 text-[11px] font-medium">
                                        <FileText className="h-3 w-3 shrink-0" />
                                        <span className="max-w-[140px] truncate">
                                          {cit.fileName}
                                        </span>
                                        {cit.pageNumber && (
                                          <span className="rounded bg-primary/10 px-1 text-[10px] font-bold">
                                            {t('copilot.pageShort', { page: cit.pageNumber })}
                                          </span>
                                        )}
                                      </span>
                                    )}
                                    {cit.snippet && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExpandedSnippetKey(isExpanded ? null : citKey)
                                        }
                                        className="px-1 text-[11px] text-muted-foreground underline"
                                      >
                                        {isExpanded
                                          ? t('copilot.hideExcerpt')
                                          : t('copilot.viewExcerpt')}
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>

                            {msg.citations.map((cit, cIdx) => {
                              const citKey = `${msg.id}-${cIdx}`;
                              if (expandedSnippetKey !== citKey || !cit.snippet) return null;
                              return (
                                <blockquote
                                  key={`${citKey}-quote`}
                                  className="rounded-lg border-l-2 border-primary bg-muted/40 px-2.5 py-1.5 text-xs italic text-muted-foreground"
                                >
                                  “{cit.snippet}”
                                </blockquote>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))
            )}

            {isAsking && (
              <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span>{t('copilot.searchingManuals')}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </main>

      {/* Sticky mobile composer */}
      <footer className="shrink-0 border-t bg-card p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2">
        {voiceMode !== 'idle' && (
          <div className="flex items-center justify-between rounded-lg bg-red-500/10 px-3 py-1.5 text-xs text-red-600">
            <span className="flex items-center gap-2 font-medium">
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              {voiceMode === 'dictating'
                ? t('copilot.listeningDictation')
                : t('copilot.recordingAudio')}
            </span>
            <button
              type="button"
              onClick={stopVoiceCapture}
              className="font-semibold underline"
            >
              {t('copilot.stopVoice')}
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSendText();
              }
            }}
            disabled={!isOnline || isAsking}
            placeholder={t('copilot.inputPlaceholder')}
            className="h-11 flex-1 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handleToggleVoice}
            disabled={!isOnline || isAsking}
            aria-label={t('copilot.voiceTooltip')}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition disabled:opacity-40 ${
              voiceMode !== 'idle'
                ? 'border-destructive bg-destructive text-white'
                : 'bg-background text-foreground active:bg-muted'
            }`}
          >
            {voiceMode !== 'idle' ? (
              <Square className="h-4 w-4" />
            ) : (
              <Mic className="h-5 w-5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => handleSendText()}
            disabled={!isOnline || isAsking || !question.trim()}
            aria-label={t('copilot.sendTooltip')}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-40"
          >
            {isAsking ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Send className="h-5 w-5" />
            )}
          </button>
        </div>
      </footer>
    </div>
  );
}
