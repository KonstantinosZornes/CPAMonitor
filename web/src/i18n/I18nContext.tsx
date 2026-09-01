import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { zh } from './locales/zh';
import { en } from './locales/en';

export type Locale = 'zh' | 'en';

type TranslationSchema = typeof zh;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (keyPath: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_LOCALE_KEY = 'cpamonitor_locale';

const dictionaries: Record<Locale, any> = {
  zh,
  en,
};

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_LOCALE_KEY) as Locale | null;
      if (stored === 'zh' || stored === 'en') return stored;
      if (typeof navigator !== 'undefined' && navigator.language) {
        return navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en';
      }
    } catch {
      // ignore
    }
    return 'zh';
  });

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(STORAGE_LOCALE_KEY, newLocale);
      document.documentElement.lang = newLocale === 'zh' ? 'zh-CN' : 'en';
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  }, [locale]);

  const t = useMemo(() => {
    const dict = dictionaries[locale] || zh;
    return (keyPath: string, params?: Record<string, string | number>): string => {
      const parts = keyPath.split('.');
      let current: any = dict;

      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = current[part];
        } else {
          // fallback to zh
          let fallback: any = zh;
          for (const fbPart of parts) {
            if (fallback && typeof fallback === 'object' && fbPart in fallback) {
              fallback = fallback[fbPart];
            } else {
              return keyPath;
            }
          }
          current = fallback;
          break;
        }
      }

      if (typeof current !== 'string') {
        return keyPath;
      }

      if (params) {
        return current.replace(/\{(\w+)\}/g, (_, k) => {
          return params[k] !== undefined ? String(params[k]) : `{${k}}`;
        });
      }

      return current;
    };
  }, [locale]);

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = (): I18nContextValue => {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
};

export const useTranslation = useI18n;
