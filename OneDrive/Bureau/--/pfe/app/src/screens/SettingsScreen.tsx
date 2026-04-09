import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { colors } from '../theme/colors';
import { useI18n } from '../i18n/useI18n';
import { feedback } from '../services/feedback';

export function SettingsScreen() {
  const { language, setLanguage, t } = useI18n();

  const selectLanguage = (nextLanguage: 'en' | 'fr') => {
    if (language === nextLanguage) return;
    setLanguage(nextLanguage);
    feedback.success(t('settings.changed'));
  };

  return (
    <ScreenContainer>
      <Text style={styles.title}>{t('settings.title')}</Text>
      <Text style={styles.subtitle}>{t('settings.subtitle')}</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{t('settings.languageTitle')}</Text>
        <Text style={styles.hint}>{t('settings.languageHint')}</Text>

        <View style={styles.languageRow}>
          <Pressable
            style={[styles.languageButton, language === 'en' ? styles.languageButtonActive : null]}
            onPress={() => selectLanguage('en')}
          >
            <Text style={language === 'en' ? styles.languageButtonTextActive : styles.languageButtonText}>
              {t('common.english')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.languageButton, language === 'fr' ? styles.languageButtonActive : null]}
            onPress={() => selectLanguage('fr')}
          >
            <Text style={language === 'fr' ? styles.languageButtonTextActive : styles.languageButtonText}>
              {t('common.french')}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.currentLanguage}>
          {t('settings.currentLanguage', {
            language: language === 'en' ? t('common.english') : t('common.french'),
          })}
        </Text>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    color: colors.textMuted,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 10,
  },
  sectionTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 16,
  },
  hint: {
    color: colors.textMuted,
    fontSize: 12,
  },
  languageRow: {
    flexDirection: 'row',
    gap: 8,
  },
  languageButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    paddingVertical: 10,
    alignItems: 'center',
  },
  languageButtonActive: {
    borderColor: colors.primary,
    backgroundColor: '#e0f2fe',
  },
  languageButtonText: {
    color: colors.text,
    fontWeight: '600',
  },
  languageButtonTextActive: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  currentLanguage: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
