import { useMemo } from 'react';
import { messages, TranslationKey } from './messages';
import { useLanguageStore } from '../store/languageStore';

type InterpolationValues = Record<string, string | number>;

function getRawText(language: 'en' | 'fr', key: TranslationKey): string {
  const parts = key.split('.');
  let value: any = messages[language];

  for (const part of parts) {
    value = value?.[part];
  }

  if (typeof value === 'string') {
    return value;
  }

  let fallback: any = messages.en;
  for (const part of parts) {
    fallback = fallback?.[part];
  }

  return typeof fallback === 'string' ? fallback : key;
}

function interpolate(text: string, values?: InterpolationValues): string {
  if (!values) return text;
  return text.replace(/\{(\w+)\}/g, (_, token: string) => String(values[token] ?? `{${token}}`));
}

export function useI18n() {
  const language = useLanguageStore((state) => state.language);
  const setLanguage = useLanguageStore((state) => state.setLanguage);
  const toggleLanguage = useLanguageStore((state) => state.toggleLanguage);

  const t = useMemo(() => {
    return (key: TranslationKey, values?: InterpolationValues) => {
      const rawText = getRawText(language, key);
      return interpolate(rawText, values);
    };
  }, [language]);

  return {
    language,
    setLanguage,
    toggleLanguage,
    t,
  };
}
