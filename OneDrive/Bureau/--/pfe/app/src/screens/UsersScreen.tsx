import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { ScreenContainer } from '../components/ScreenContainer';
import { StatCard } from '../components/StatCard';
import { useAuthStore } from '../store/authStore';
import { api, API_BASE_URL } from '../services/api';
import { feedback } from '../services/feedback';
import { colors } from '../theme/colors';
import { useLanguageStore } from '../store/languageStore';

type UserRole = 'ADMIN' | 'DOCTOR' | 'NURSE';

type DirectoryUser = {
  _id?: string;
  id?: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  profilePicture?: string;
  role: UserRole;
  isActive?: boolean;
  specialization?: string;
  licenseNumber?: string;
  shift?: string;
  certificationLevel?: string;
  department?: string;
};

type DashboardStats = {
  patients: {
    total: number;
    active: number;
    critical: number;
  };
};

type UserForm = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  password: string;
  role: 'DOCTOR' | 'NURSE';
  specialization: string;
  licenseNumber: string;
  shift: string;
  certificationLevel: string;
  department: string;
};

const initialForm: UserForm = {
  email: '',
  firstName: '',
  lastName: '',
  phone: '',
  password: '',
  role: 'DOCTOR',
  specialization: '',
  licenseNumber: '',
  shift: 'DAY',
  certificationLevel: '',
  department: '',
};

export function UsersScreen() {
  const user = useAuthStore((state) => state.user);
  const language = useLanguageStore((state) => state.language);
  const tr = (en: string, fr: string) => (language === 'fr' ? fr : en);
  const canManage = user?.role === 'ADMIN';

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'DOCTOR' | 'NURSE'>('ALL');

  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<DirectoryUser | null>(null);
  const [form, setForm] = useState<UserForm>(initialForm);
  const [profileFile, setProfileFile] = useState<{ uri: string; mimeType: string; name: string } | null>(null);
  const [profilePreview, setProfilePreview] = useState('');
  const [removeProfilePicture, setRemoveProfilePicture] = useState(false);

  const normalizeMediaUrl = (path?: string) => {
    if (!path) return '';
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const host = API_BASE_URL.replace(/\/api\/v\d+\/?$/, '');
    return `${host}${path.startsWith('/') ? '' : '/'}${path}`;
  };

  const getUserId = (value: DirectoryUser) => value._id || value.id || '';

  const getInitials = (firstName?: string, lastName?: string) => {
    const initials = `${(firstName || '').charAt(0)}${(lastName || '').charAt(0)}`.toUpperCase();
    return initials || 'U';
  };

  const fetchData = async (isPull = false) => {
    try {
      if (isPull) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      const [usersRes, statsRes] = await Promise.all([
        api.get('/users'),
        api.get('/dashboard/stats'),
      ]);

      setUsers(usersRes.data?.data?.users || []);
      setStats(statsRes.data?.data || null);
    } catch (err: any) {
      feedback.error(err?.response?.data?.error?.message || tr('Failed to load users', 'Echec du chargement des utilisateurs'));
    } finally {
      if (isPull) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    void fetchData(false);
  }, []);

  const openCreate = () => {
    setEditingUser(null);
    setForm(initialForm);
    setProfileFile(null);
    setProfilePreview('');
    setRemoveProfilePicture(false);
    setShowModal(true);
  };

  const openEdit = (current: DirectoryUser) => {
    setEditingUser(current);
    setForm({
      email: current.email || '',
      firstName: current.firstName || '',
      lastName: current.lastName || '',
      phone: current.phone || '',
      password: '',
      role: current.role === 'NURSE' ? 'NURSE' : 'DOCTOR',
      specialization: current.specialization || '',
      licenseNumber: current.licenseNumber || '',
      shift: current.shift || 'DAY',
      certificationLevel: current.certificationLevel || '',
      department: current.department || '',
    });
    setProfileFile(null);
    setProfilePreview(normalizeMediaUrl(current.profilePicture));
    setRemoveProfilePicture(false);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setForm(initialForm);
    setProfileFile(null);
    setProfilePreview('');
    setRemoveProfilePicture(false);
  };

  const pickProfileImage = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['image/*'],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    setProfileFile({
      uri: asset.uri,
      mimeType: asset.mimeType || 'image/jpeg',
      name: asset.name || `profile-${Date.now()}.jpg`,
    });
    setProfilePreview(asset.uri);
    setRemoveProfilePicture(false);
  };

  const toggleRemovePicture = () => {
    const next = !removeProfilePicture;
    setRemoveProfilePicture(next);
    if (next) {
      setProfileFile(null);
      setProfilePreview('');
    } else if (editingUser?.profilePicture) {
      setProfilePreview(normalizeMediaUrl(editingUser.profilePicture));
    }
  };

  const submit = async () => {
    if (!form.email.trim() || !form.firstName.trim() || !form.lastName.trim()) {
      feedback.info(tr('Email, first name and last name are required.', 'Email, prenom et nom sont requis.'));
      return;
    }

    if (!editingUser && !form.password.trim()) {
      feedback.info(tr('Password is required for new users.', 'Mot de passe requis pour un nouvel utilisateur.'));
      return;
    }

    try {
      setSubmitting(true);

      const payload = new FormData();
      payload.append('email', form.email.trim());
      payload.append('firstName', form.firstName.trim());
      payload.append('lastName', form.lastName.trim());
      payload.append('phone', form.phone.trim());
      payload.append('role', editingUser ? editingUser.role : form.role);
      payload.append('specialization', form.specialization.trim());
      payload.append('licenseNumber', form.licenseNumber.trim());
      payload.append('shift', form.shift.trim() || 'DAY');
      payload.append('certificationLevel', form.certificationLevel.trim());
      payload.append('department', form.department.trim());

      if (profileFile) {
        payload.append('profilePicture', {
          uri: profileFile.uri,
          type: profileFile.mimeType,
          name: profileFile.name,
        } as any);
      } else if (editingUser && removeProfilePicture) {
        payload.append('removeProfilePicture', 'true');
      }

      if (editingUser) {
        const userId = getUserId(editingUser);
        await api.put(`/users/${userId}`, payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        feedback.success(tr('User updated', 'Utilisateur mis a jour'));
      } else {
        payload.append('password', form.password.trim());
        await api.post('/auth/register', payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        feedback.success(tr('User created', 'Utilisateur cree'));
      }

      closeModal();
      await fetchData(false);
    } catch (err: any) {
      feedback.error(err?.response?.data?.error?.message || tr('Failed to save user', 'Echec de sauvegarde utilisateur'));
    } finally {
      setSubmitting(false);
    }
  };

  const deleteUser = (target: DirectoryUser) => {
    const userId = getUserId(target);
    if (!userId) return;

    Alert.alert(tr('Delete user', 'Supprimer utilisateur'), `${tr('Delete', 'Supprimer')} ${target.firstName} ${target.lastName} ?`, [
      { text: tr('Cancel', 'Annuler'), style: 'cancel' },
      {
        text: tr('Delete', 'Supprimer'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await api.delete(`/users/${userId}`);
              feedback.success(tr('User deleted', 'Utilisateur supprime'));
              await fetchData(false);
            } catch (err: any) {
              feedback.error(err?.response?.data?.error?.message || tr('Failed to delete user', 'Echec de suppression utilisateur'));
            }
          })();
        },
      },
    ]);
  };

  const filteredUsers = useMemo(() => {
    return users.filter((entry) => {
      if (entry.role === 'ADMIN') return false;
      if (roleFilter !== 'ALL' && entry.role !== roleFilter) return false;

      const needle = search.trim().toLowerCase();
      if (!needle) return true;

      const fullName = `${entry.firstName || ''} ${entry.lastName || ''}`.toLowerCase();
      return (
        fullName.includes(needle) ||
        String(entry.email || '').toLowerCase().includes(needle) ||
        String(entry.phone || '').toLowerCase().includes(needle)
      );
    });
  }, [users, search, roleFilter]);

  const totalStaff = users.filter((entry) => entry.role !== 'ADMIN').length;
  const doctorCount = users.filter((entry) => entry.role === 'DOCTOR').length;
  const nurseCount = users.filter((entry) => entry.role === 'NURSE').length;

  if (loading) {
    return (
      <ScreenContainer>
        <ActivityIndicator color={colors.primary} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>{tr('Users', 'Utilisateurs')}</Text>
          <Text style={styles.subtitle}>{tr('Doctors and nurses directory', 'Annuaire medecins et infirmiers')}</Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable style={styles.secondaryBtn} onPress={() => void fetchData(true)}>
            {refreshing ? <ActivityIndicator color={colors.primaryDark} /> : <Text style={styles.secondaryBtnText}>{tr('Refresh', 'Actualiser')}</Text>}
          </Pressable>
          {canManage ? (
            <Pressable style={styles.primaryBtn} onPress={openCreate}>
              <Text style={styles.primaryBtnText}>{tr('Add User', 'Ajouter utilisateur')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <View style={styles.statsGrid}>
        <StatCard title={tr('Total Staff', 'Personnel total')} value={totalStaff} subtitle={tr('Doctors + Nurses', 'Medecins + Infirmiers')} />
        <StatCard title={tr('Patients', 'Patients')} value={stats?.patients.total || 0} subtitle={tr(`${stats?.patients.active || 0} active`, `${stats?.patients.active || 0} actifs`)} />
        <StatCard title={tr('Doctors', 'Medecins')} value={doctorCount} subtitle={tr('Medical staff', 'Personnel medical')} />
        <StatCard title={tr('Nurses', 'Infirmiers')} value={nurseCount} subtitle={tr('Care team', 'Equipe de soins')} />
      </View>

      <View style={styles.listSection}>
        <TextInput
          style={styles.searchInput}
          placeholder={tr('Search by name, email or phone', 'Rechercher par nom, email ou telephone')}
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />

        <View style={styles.chipsRow}>
          {(['ALL', 'DOCTOR', 'NURSE'] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setRoleFilter(value)}
              style={[styles.chip, roleFilter === value ? styles.chipActive : null]}
            >
              <Text style={roleFilter === value ? styles.chipTextActive : styles.chipText}>{value}</Text>
            </Pressable>
          ))}
        </View>

        {filteredUsers.length === 0 ? (
          <Text style={styles.meta}>{tr('No users found.', 'Aucun utilisateur trouve.')}</Text>
        ) : (
          filteredUsers.map((entry) => {
            const userId = getUserId(entry);
            const avatar = normalizeMediaUrl(entry.profilePicture);
            return (
              <View key={userId || `${entry.email}-${entry.role}`} style={styles.userCard}>
                {avatar ? (
                  <Image source={{ uri: avatar }} style={styles.avatar} />
                ) : (
                  <View style={styles.avatarFallback}>
                    <Text style={styles.avatarFallbackText}>{getInitials(entry.firstName, entry.lastName)}</Text>
                  </View>
                )}

                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{entry.firstName} {entry.lastName}</Text>
                  <Text style={styles.meta}>{entry.email}</Text>
                  <Text style={styles.meta}>{entry.phone || '--'} • {entry.department || '--'}</Text>
                </View>

                <View style={styles.sideCol}>
                  <View style={[styles.roleBadge, entry.role === 'DOCTOR' ? styles.roleDoctor : styles.roleNurse]}>
                    <Text style={styles.roleBadgeText}>{entry.role}</Text>
                  </View>
                  {canManage ? (
                    <View style={styles.itemActions}>
                      <Pressable style={styles.iconBtn} onPress={() => openEdit(entry)}>
                        <Text style={styles.iconBtnText}>{tr('Edit', 'Modifier')}</Text>
                      </Pressable>
                      <Pressable style={styles.iconDangerBtn} onPress={() => deleteUser(entry)}>
                        <Text style={styles.iconDangerBtnText}>{tr('Delete', 'Supprimer')}</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </View>

      <Modal visible={showModal} animationType="slide" onRequestClose={closeModal}>
        <ScreenContainer>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingUser ? tr('Edit User', 'Modifier utilisateur') : tr('Create User', 'Creer utilisateur')}</Text>
            <Pressable style={styles.secondaryBtn} onPress={closeModal}>
              <Text style={styles.secondaryBtnText}>{tr('Close', 'Fermer')}</Text>
            </Pressable>
          </View>

          <View style={styles.modalForm}>
            <TextInput
              style={styles.input}
              placeholder={tr('Email', 'Email')}
              placeholderTextColor={colors.textMuted}
              value={form.email}
              onChangeText={(value) => setForm((prev) => ({ ...prev, email: value }))}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!Boolean(editingUser)}
            />
            <TextInput
              style={styles.input}
              placeholder={tr('First name', 'Prenom')}
              placeholderTextColor={colors.textMuted}
              value={form.firstName}
              onChangeText={(value) => setForm((prev) => ({ ...prev, firstName: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder={tr('Last name', 'Nom')}
              placeholderTextColor={colors.textMuted}
              value={form.lastName}
              onChangeText={(value) => setForm((prev) => ({ ...prev, lastName: value }))}
            />
            <TextInput
              style={styles.input}
              placeholder={tr('Phone', 'Telephone')}
              placeholderTextColor={colors.textMuted}
              value={form.phone}
              onChangeText={(value) => setForm((prev) => ({ ...prev, phone: value }))}
            />

            {!editingUser ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder={tr('Password', 'Mot de passe')}
                  placeholderTextColor={colors.textMuted}
                  value={form.password}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, password: value }))}
                  secureTextEntry
                />
                <Text style={styles.fieldLabel}>{tr('Role', 'Role')}</Text>
                <View style={styles.chipsRow}>
                  {(['DOCTOR', 'NURSE'] as const).map((value) => (
                    <Pressable
                      key={value}
                      onPress={() => setForm((prev) => ({ ...prev, role: value }))}
                      style={[styles.chip, form.role === value ? styles.chipActive : null]}
                    >
                      <Text style={form.role === value ? styles.chipTextActive : styles.chipText}>{value}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : (
              <Text style={styles.meta}>{tr('Role', 'Role')}: {editingUser.role}</Text>
            )}

            {(editingUser?.role === 'DOCTOR' || (!editingUser && form.role === 'DOCTOR')) ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder={tr('Specialization', 'Specialite')}
                  placeholderTextColor={colors.textMuted}
                  value={form.specialization}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, specialization: value }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder={tr('License number', 'Numero licence')}
                  placeholderTextColor={colors.textMuted}
                  value={form.licenseNumber}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, licenseNumber: value }))}
                />
              </>
            ) : null}

            {(editingUser?.role === 'NURSE' || (!editingUser && form.role === 'NURSE')) ? (
              <>
                <TextInput
                  style={styles.input}
                  placeholder={tr('Shift (DAY/NIGHT)', 'Shift (DAY/NIGHT)')}
                  placeholderTextColor={colors.textMuted}
                  value={form.shift}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, shift: value.toUpperCase() }))}
                />
                <TextInput
                  style={styles.input}
                  placeholder={tr('Certification level', 'Niveau certification')}
                  placeholderTextColor={colors.textMuted}
                  value={form.certificationLevel}
                  onChangeText={(value) => setForm((prev) => ({ ...prev, certificationLevel: value }))}
                />
              </>
            ) : null}

            <TextInput
              style={styles.input}
              placeholder={tr('Department', 'Departement')}
              placeholderTextColor={colors.textMuted}
              value={form.department}
              onChangeText={(value) => setForm((prev) => ({ ...prev, department: value }))}
            />

            <View style={styles.pictureCard}>
              <Text style={styles.fieldLabel}>{tr('Profile picture', 'Photo profil')}</Text>
              <View style={styles.pictureActions}>
                <Pressable style={styles.iconBtn} onPress={() => void pickProfileImage()}>
                  <Text style={styles.iconBtnText}>{tr('Choose', 'Choisir')}</Text>
                </Pressable>
                {editingUser ? (
                  <Pressable style={styles.iconDangerBtn} onPress={toggleRemovePicture}>
                    <Text style={styles.iconDangerBtnText}>{removeProfilePicture ? tr('Undo remove', 'Annuler suppression') : tr('Remove', 'Supprimer')}</Text>
                  </Pressable>
                ) : null}
              </View>

              {profilePreview ? <Image source={{ uri: profilePreview }} style={styles.previewImage} /> : <Text style={styles.meta}>{tr('No image selected', 'Aucune image selectionnee')}</Text>}
            </View>

            <Pressable
              style={[styles.primaryBtn, submitting ? styles.primaryBtnDisabled : null]}
              disabled={submitting}
              onPress={() => void submit()}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{tr('Save', 'Enregistrer')}</Text>}
            </Pressable>
          </View>
        </ScreenContainer>
      </Modal>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    color: colors.textMuted,
  },
  statsGrid: {
    gap: 8,
  },
  listSection: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    backgroundColor: colors.surface,
    gap: 10,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    backgroundColor: '#fff',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fff',
  },
  chipActive: {
    borderColor: colors.primary,
    backgroundColor: '#e0f2fe',
  },
  chipText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 12,
  },
  chipTextActive: {
    color: colors.primaryDark,
    fontWeight: '700',
    fontSize: 12,
  },
  userCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarFallback: {
    width: 44,
    height: 44,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
  },
  avatarFallbackText: {
    color: colors.text,
    fontWeight: '600',
  },
  userName: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  sideCol: {
    alignItems: 'flex-end',
    gap: 8,
  },
  roleBadge: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  roleDoctor: {
    backgroundColor: '#dbeafe',
  },
  roleNurse: {
    backgroundColor: '#dcfce7',
  },
  roleBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0f172a',
  },
  itemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f8fafc',
  },
  iconBtnText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 12,
  },
  iconDangerBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#fef2f2',
  },
  iconDangerBtnText: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 12,
  },
  secondaryBtn: {
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  secondaryBtnText: {
    color: colors.primaryDark,
    fontWeight: '700',
  },
  primaryBtn: {
    borderRadius: 10,
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  primaryBtnDisabled: {
    opacity: 0.7,
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  modalTitle: {
    fontSize: 22,
    color: colors.text,
    fontWeight: '700',
  },
  modalForm: {
    gap: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
  },
  fieldLabel: {
    fontSize: 13,
    color: colors.textMuted,
    fontWeight: '600',
  },
  pictureCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    padding: 10,
    gap: 8,
  },
  pictureActions: {
    flexDirection: 'row',
    gap: 8,
  },
  previewImage: {
    width: 90,
    height: 90,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
