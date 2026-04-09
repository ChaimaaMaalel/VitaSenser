export const messages = {
  en: {
    common: {
      refresh: 'Refresh',
      close: 'Close',
      save: 'Save',
      loading: 'Loading...',
      language: 'Language',
      english: 'English',
      french: 'French',
      settings: 'Settings',
    },
    tabs: {
      dashboard: 'Dashboard',
      patients: 'Patients',
      alerts: 'Alerts',
      notifications: 'Notifications',
      simulation: 'Simulation',
      hospital: 'Hospital',
      users: 'Users',
      settings: 'Settings',
    },
    login: {
      title: 'Smart Hospital',
      subtitle: 'Sign in to mobile app',
      emailPlaceholder: 'Email',
      passwordPlaceholder: 'Password',
      signIn: 'Sign in',
      failed: 'Login failed',
      invalidResponse: 'Invalid login response',
      apiHint: 'API',
    },
    dashboard: {
      title: 'Dashboard',
      welcome: 'Welcome {name}',
      loading: 'Loading dashboard...',
      loadFailed: 'Failed to load dashboard',
      logout: 'Logout',
      totalPatients: 'Total Patients',
      activePatients: '{count} active',
      criticalAlerts: 'Critical Alerts',
      activeAlerts: '{count} active',
      role: 'Role',
      bedOccupancy: 'Bed Occupancy',
      occupiedBeds: '{occupied}/{total} occupied',
      recentAlerts: 'Recent Alerts',
      noRecentAlerts: 'No recent alerts',
      assignedPatients: 'Assigned Patients',
      noAssignedPatients: 'No assigned patients',
    },
    settings: {
      title: 'Settings',
      subtitle: 'App preferences and language',
      languageTitle: 'App language',
      languageHint: 'Choose how labels and messages are displayed',
      currentLanguage: 'Current language: {language}',
      changed: 'Language updated',
    },
  },
  fr: {
    common: {
      refresh: 'Actualiser',
      close: 'Fermer',
      save: 'Enregistrer',
      loading: 'Chargement...',
      language: 'Langue',
      english: 'Anglais',
      french: 'Francais',
      settings: 'Parametres',
    },
    tabs: {
      dashboard: 'Tableau',
      patients: 'Patients',
      alerts: 'Alertes',
      notifications: 'Notifications',
      simulation: 'Simulation',
      hospital: 'Hopital',
      users: 'Utilisateurs',
      settings: 'Parametres',
    },
    login: {
      title: 'Smart Hospital',
      subtitle: 'Connexion a l application mobile',
      emailPlaceholder: 'Email',
      passwordPlaceholder: 'Mot de passe',
      signIn: 'Se connecter',
      failed: 'Echec de connexion',
      invalidResponse: 'Reponse de connexion invalide',
      apiHint: 'API',
    },
    dashboard: {
      title: 'Tableau de bord',
      welcome: 'Bienvenue {name}',
      loading: 'Chargement du tableau...',
      loadFailed: 'Echec du chargement du tableau',
      logout: 'Deconnexion',
      totalPatients: 'Total patients',
      activePatients: '{count} actifs',
      criticalAlerts: 'Alertes critiques',
      activeAlerts: '{count} actives',
      role: 'Role',
      bedOccupancy: 'Occupation des lits',
      occupiedBeds: '{occupied}/{total} occupes',
      recentAlerts: 'Alertes recentes',
      noRecentAlerts: 'Aucune alerte recente',
      assignedPatients: 'Patients assignes',
      noAssignedPatients: 'Aucun patient assigne',
    },
    settings: {
      title: 'Parametres',
      subtitle: 'Preferences de l application et langue',
      languageTitle: 'Langue de l application',
      languageHint: 'Choisissez la langue des libelles et messages',
      currentLanguage: 'Langue actuelle : {language}',
      changed: 'Langue mise a jour',
    },
  },
} as const;

export type TranslationKey =
  | 'common.refresh'
  | 'common.close'
  | 'common.save'
  | 'common.loading'
  | 'common.language'
  | 'common.english'
  | 'common.french'
  | 'common.settings'
  | 'tabs.dashboard'
  | 'tabs.patients'
  | 'tabs.alerts'
  | 'tabs.notifications'
  | 'tabs.simulation'
  | 'tabs.hospital'
  | 'tabs.users'
  | 'tabs.settings'
  | 'login.title'
  | 'login.subtitle'
  | 'login.emailPlaceholder'
  | 'login.passwordPlaceholder'
  | 'login.signIn'
  | 'login.failed'
  | 'login.invalidResponse'
  | 'login.apiHint'
  | 'dashboard.title'
  | 'dashboard.welcome'
  | 'dashboard.loading'
  | 'dashboard.loadFailed'
  | 'dashboard.logout'
  | 'dashboard.totalPatients'
  | 'dashboard.activePatients'
  | 'dashboard.criticalAlerts'
  | 'dashboard.activeAlerts'
  | 'dashboard.role'
  | 'dashboard.bedOccupancy'
  | 'dashboard.occupiedBeds'
  | 'dashboard.recentAlerts'
  | 'dashboard.noRecentAlerts'
  | 'dashboard.assignedPatients'
  | 'dashboard.noAssignedPatients'
  | 'settings.title'
  | 'settings.subtitle'
  | 'settings.languageTitle'
  | 'settings.languageHint'
  | 'settings.currentLanguage'
  | 'settings.changed';
