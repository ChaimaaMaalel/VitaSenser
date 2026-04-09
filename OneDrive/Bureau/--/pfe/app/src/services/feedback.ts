import { Alert, Platform, ToastAndroid } from 'react-native';

type FeedbackType = 'success' | 'error' | 'info';

const titleByType: Record<FeedbackType, string> = {
  success: 'Success',
  error: 'Error',
  info: 'Info',
};

const androidPrefix: Record<FeedbackType, string> = {
  success: 'OK',
  error: 'ERR',
  info: 'INFO',
};

function notify(type: FeedbackType, message: string) {
  if (!message) return;

  if (Platform.OS === 'android') {
    ToastAndroid.show(`${androidPrefix[type]}: ${message}`, ToastAndroid.SHORT);
    return;
  }

  Alert.alert(titleByType[type], message);
}

export const feedback = {
  success: (message: string) => notify('success', message),
  error: (message: string) => notify('error', message),
  info: (message: string) => notify('info', message),
};
