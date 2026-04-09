import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ScreenContainer } from '../components/ScreenContainer';
import { colors } from '../theme/colors';
import { api } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useI18n } from '../i18n/useI18n';

export function LoginScreen() {
  const login = useAuthStore((state) => state.login);
  const { language, toggleLanguage, t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.post('/auth/login', { email, password });
      const user = response.data?.data?.user;
      const token = response.data?.data?.tokens?.accessToken;

      if (!user || !token) {
        throw new Error(t('login.invalidResponse'));
      }

      login({
        user: {
          id: user._id || user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
        },
        accessToken: token,
      });
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || t('login.failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScreenContainer scroll={false}>
      <View style={styles.wrapper}>
        <View style={styles.card}>
          <View style={styles.languageRow}>
            <Text style={styles.languageLabel}>{t('common.language')}</Text>
            <Pressable style={styles.languageSwitch} onPress={toggleLanguage}>
              <Text style={styles.languageSwitchText}>{language.toUpperCase()}</Text>
            </Pressable>
          </View>

          <Text style={styles.title}>{t('login.title')}</Text>
          <Text style={styles.subtitle}>{t('login.subtitle')}</Text>

          <TextInput
            value={email}
            onChangeText={setEmail}
            style={styles.input}
            keyboardType="email-address"
            autoCapitalize="none"
            placeholder={t('login.emailPlaceholder')}
            placeholderTextColor={colors.textMuted}
          />
          <TextInput
            value={password}
            onChangeText={setPassword}
            style={styles.input}
            secureTextEntry
            placeholder={t('login.passwordPlaceholder')}
            placeholderTextColor={colors.textMuted}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={styles.button} onPress={onSubmit} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t('login.signIn')}</Text>
            )}
          </Pressable>

          <Text style={styles.apiHint}>{t('login.apiHint')}: {api.defaults.baseURL}</Text>
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: colors.background,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 18,
    gap: 10,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    marginBottom: 2,
  },
  languageLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  languageSwitch: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#fff',
  },
  languageSwitchText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 11,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    color: colors.textMuted,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  button: {
    marginTop: 6,
    backgroundColor: colors.primary,
    borderRadius: 10,
    alignItems: 'center',
    paddingVertical: 12,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700',
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
  apiHint: {
    marginTop: 4,
    fontSize: 11,
    color: colors.textMuted,
  },
});
