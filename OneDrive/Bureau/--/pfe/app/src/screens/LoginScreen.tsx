import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ScreenContainer } from '../components/ScreenContainer';
import { colors } from '../theme/colors';
import { api, API_BASE_URL } from '../services/api';
import { useAuthStore } from '../store/authStore';
import { useI18n } from '../i18n/useI18n';

export function LoginScreen() {
  const login = useAuthStore((state) => state.login);
  const { language, toggleLanguage, t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      console.log('Login error:', {
        message: err?.message,
        status: err?.response?.status,
        data: err?.response?.data,
        baseUrl: API_BASE_URL,
      });

      const status = err?.response?.status;
      const message = err?.response?.data?.error?.message || err?.message;
      setError(`${t('login.failed')} ${status ? `(HTTP ${status})` : ''} ${message || ''}`.trim());
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

          <View style={styles.inputRow}>
            <MaterialCommunityIcons name="email-outline" size={20} color={colors.textMuted} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder={t('login.emailPlaceholder')}
              placeholderTextColor={colors.textMuted}
            />
          </View>
          <View style={styles.inputRow}>
            <MaterialCommunityIcons name="lock-outline" size={20} color={colors.textMuted} />
            <TextInput
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              secureTextEntry={!showPassword}
              placeholder={t('login.passwordPlaceholder')}
              placeholderTextColor={colors.textMuted}
            />
            <Pressable
              onPress={() => setShowPassword((prev) => !prev)}
              accessibilityLabel={showPassword ? t('login.hidePassword') : t('login.showPassword')}
            >
              <MaterialCommunityIcons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Text style={styles.apiHint}>API: {API_BASE_URL}</Text>

          <Pressable style={styles.button} onPress={onSubmit} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>{t('login.signIn')}</Text>
            )}
          </Pressable>

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
    color: colors.text,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flex: 1,
  },
  inputRow: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
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
