import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ScreenContainer } from '../components/ScreenContainer';
import { api } from '../services/api';
import { colors, statusColors } from '../theme/colors';
import { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../store/authStore';
import { useLanguageStore } from '../store/languageStore';

type PatientItem = {
  _id?: string;
  id?: string;
  firstName: string;
  lastName: string;
  dateOfBirth?: string;
  gender?: string;
  bloodType?: string;
  medicalHistory?: string;
  allergies?: string[];
  status?: string;
  assignedDoctor?: {
    _id?: string;
    user?: { firstName?: string; lastName?: string };
  };
  assignedNurses?: Array<{
    _id?: string;
    user?: { firstName?: string; lastName?: string };
  }>;
  bed?: {
    _id?: string;
    bedNumber?: string;
  };
};

type PatientMetadata = {
  doctors: Array<{ _id: string; firstName: string; lastName: string; specialization?: string }>;
  nurses: Array<{ _id: string; firstName: string; lastName: string; shift?: string }>;
  beds: Array<{ _id: string; bedNumber?: string; room?: { roomNumber?: string } }>;
};

type PatientForm = {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  gender: 'MALE' | 'FEMALE' | 'OTHER';
  status: 'CRITICAL' | 'MODERATE' | 'STABLE' | 'RECOVERING' | 'DISCHARGED';
  bloodType: string;
  medicalHistory: string;
  allergies: string;
  assignedDoctorId: string;
  assignedNurseId: string;
  bedId: string;
};

const initialForm: PatientForm = {
  firstName: '',
  lastName: '',
  dateOfBirth: '',
  gender: 'MALE',
  status: 'STABLE',
  bloodType: '',
  medicalHistory: '',
  allergies: '',
  assignedDoctorId: '',
  assignedNurseId: '',
  bedId: '',
};

export function PatientsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const user = useAuthStore((state) => state.user);
  const language = useLanguageStore((state) => state.language);
  const tr = (en: string, fr: string) => (language === 'fr' ? fr : en);
  const [patients, setPatients] = useState<PatientItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [form, setForm] = useState<PatientForm>(initialForm);
  const [metadata, setMetadata] = useState<PatientMetadata>({ doctors: [], nurses: [], beds: [] });

  const isAdmin = user?.role === 'ADMIN';
  const isNurse = user?.role === 'NURSE';
  const canManage = isAdmin || isNurse;

  const getPatientId = (patient: PatientItem) => patient._id || patient.id || '';

  const updateForm = <K extends keyof PatientForm>(key: K, value: PatientForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const toInputDate = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return date.toISOString().split('T')[0];
  };

  const resetModal = () => {
    setEditingPatientId(null);
    setForm(initialForm);
    setIsModalVisible(false);
  };

  const openCreate = () => {
    setEditingPatientId(null);
    setForm(initialForm);
    setIsModalVisible(true);
  };

  const openEdit = (patient: PatientItem) => {
    setEditingPatientId(getPatientId(patient));
    setForm({
      firstName: patient.firstName || '',
      lastName: patient.lastName || '',
      dateOfBirth: toInputDate(patient.dateOfBirth),
      gender: (String(patient.gender || 'MALE').toUpperCase() as PatientForm['gender']) || 'MALE',
      status: (String(patient.status || 'STABLE').toUpperCase() as PatientForm['status']) || 'STABLE',
      bloodType: patient.bloodType || '',
      medicalHistory: patient.medicalHistory || '',
      allergies: (patient.allergies || []).join(', '),
      assignedDoctorId: patient.assignedDoctor?._id || '',
      assignedNurseId: patient.assignedNurses?.[0]?._id || '',
      bedId: patient.bed?._id || '',
    });
    setIsModalVisible(true);
  };

  const fetchPatients = async (isPull = false) => {
    if (isPull) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const response = await api.get('/patients');
      setPatients(response.data?.data?.patients || []);
    } catch (err: any) {
      setError(err?.response?.data?.error?.message || tr('Failed to load patients', 'Echec du chargement des patients'));
    } finally {
      if (isPull) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  const fetchMetadata = async () => {
    if (!canManage) return;
    try {
      const response = await api.get('/patients/metadata');
      const data = response.data?.data || {};
      setMetadata({
        doctors: data.doctors || [],
        nurses: data.nurses || [],
        beds: data.beds || [],
      });
    } catch {
      // Keep metadata optional for manual id entry.
    }
  };

  useEffect(() => {
    void fetchPatients(false);
    void fetchMetadata();
  }, [canManage]);

  const submitForm = async () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.dateOfBirth.trim()) {
      Alert.alert(tr('Validation', 'Validation'), tr('First name, last name, and date of birth are required.', 'Le prenom, le nom et la date de naissance sont requis.'));
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = new FormData();
      payload.append('firstName', form.firstName.trim());
      payload.append('lastName', form.lastName.trim());
      payload.append('dateOfBirth', form.dateOfBirth.trim());
      payload.append('gender', form.gender);
      payload.append('status', form.status);
      payload.append('bloodType', form.bloodType || '');
      payload.append('medicalHistory', form.medicalHistory || '');
      payload.append(
        'allergies',
        JSON.stringify(
          form.allergies
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
        )
      );
      payload.append('bedId', form.bedId || '');
      payload.append('assignedDoctorId', form.assignedDoctorId || '');
      payload.append(
        'assignedNurseIds',
        JSON.stringify(form.assignedNurseId ? [form.assignedNurseId] : [])
      );

      if (editingPatientId) {
        await api.put(`/patients/${editingPatientId}`, payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      } else {
        await api.post('/patients', payload, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
      }

      resetModal();
      await fetchPatients(false);
    } catch (err: any) {
      Alert.alert(tr('Error', 'Erreur'), err?.response?.data?.error?.message || tr('Failed to save patient', 'Echec de sauvegarde du patient'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const deletePatient = (patient: PatientItem) => {
    const patientId = getPatientId(patient);
    if (!patientId) return;

    Alert.alert(tr('Delete patient', 'Supprimer patient'), `${tr('Delete', 'Supprimer')} ${patient.firstName} ${patient.lastName} ?`, [
      { text: tr('Cancel', 'Annuler'), style: 'cancel' },
      {
        text: tr('Delete', 'Supprimer'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/patients/${patientId}`);
            await fetchPatients(false);
          } catch (err: any) {
            Alert.alert(tr('Error', 'Erreur'), err?.response?.data?.error?.message || tr('Failed to delete patient', 'Echec de suppression du patient'));
          }
        },
      },
    ]);
  };

  const filteredPatients = patients.filter((item) => {
    if (!search.trim()) return true;
    const needle = search.toLowerCase();
    const id = (item._id || item.id || '').toLowerCase();
    return (
      item.firstName.toLowerCase().includes(needle) ||
      item.lastName.toLowerCase().includes(needle) ||
      id.includes(needle)
    );
  });

  return (
    <ScreenContainer>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{tr('Patients', 'Patients')}</Text>
        <View style={styles.actionRow}>
          <Pressable style={styles.secondaryBtn} onPress={() => void fetchPatients(false)}>
            <Text style={styles.secondaryBtnText}>{tr('Refresh', 'Actualiser')}</Text>
          </Pressable>
          {canManage ? (
            <Pressable style={styles.primaryBtn} onPress={openCreate}>
              <Text style={styles.primaryBtnText}>{tr('Add', 'Ajouter')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder={tr('Search by name or id', 'Rechercher par nom ou id')}
        placeholderTextColor={colors.textMuted}
        style={styles.searchInput}
      />

      {loading ? <ActivityIndicator color={colors.primary} /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <FlatList
        data={filteredPatients}
        keyExtractor={(item) => item._id || item.id || `${item.firstName}-${item.lastName}`}
        scrollEnabled={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void fetchPatients(true)}
            tintColor={colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.muted}>{tr('No patients found.', 'Aucun patient trouve.')}</Text>
          </View>
        }
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => {
          const status = String(item.status || 'STABLE').toUpperCase();
          return (
            <View style={styles.card}>
              <Pressable
                onPress={() =>
                  navigation.navigate('PatientDetail', {
                    patientId: item._id || item.id || '',
                  })
                }
                style={{ flex: 1 }}
              >
                <Text style={styles.name}>{item.firstName} {item.lastName}</Text>
                <Text style={styles.muted}>{tr('Tap to open details', 'Touchez pour ouvrir les details')}</Text>
              </Pressable>

              <View style={{ alignItems: 'flex-end', gap: 8 }}>
                <View
                  style={[
                    styles.badge,
                    { backgroundColor: statusColors[status as keyof typeof statusColors] || colors.info },
                  ]}
                >
                  <Text style={styles.badgeText}>{status}</Text>
                </View>
                {canManage ? (
                  <View style={styles.itemActionRow}>
                    <Pressable style={styles.iconBtn} onPress={() => openEdit(item)}>
                      <Text style={styles.iconBtnText}>{tr('Edit', 'Modifier')}</Text>
                    </Pressable>
                    <Pressable style={styles.iconBtnDanger} onPress={() => deletePatient(item)}>
                      <Text style={styles.iconBtnDangerText}>{tr('Delete', 'Supprimer')}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            </View>
          );
        }}
      />

      <Modal visible={isModalVisible} animationType="slide" onRequestClose={resetModal}>
        <View style={styles.modalRoot}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{editingPatientId ? tr('Edit Patient', 'Modifier patient') : tr('Create Patient', 'Creer patient')}</Text>
            <Pressable style={styles.secondaryBtn} onPress={resetModal}>
              <Text style={styles.secondaryBtnText}>{tr('Close', 'Fermer')}</Text>
            </Pressable>
          </View>

          <FlatList
            data={[{ key: 'form' }]}
            keyExtractor={(item) => item.key}
            renderItem={() => (
              <View style={styles.modalForm}>
                <TextInput
                  style={styles.input}
                  placeholder={tr('First name', 'Prenom')}
                  placeholderTextColor={colors.textMuted}
                  value={form.firstName}
                  onChangeText={(value) => updateForm('firstName', value)}
                />
                <TextInput
                  style={styles.input}
                  placeholder={tr('Last name', 'Nom')}
                  placeholderTextColor={colors.textMuted}
                  value={form.lastName}
                  onChangeText={(value) => updateForm('lastName', value)}
                />
                <TextInput
                  style={styles.input}
                  placeholder={tr('Date of birth (YYYY-MM-DD)', 'Date de naissance (YYYY-MM-DD)')}
                  placeholderTextColor={colors.textMuted}
                  value={form.dateOfBirth}
                  onChangeText={(value) => updateForm('dateOfBirth', value)}
                />

                <Text style={styles.fieldLabel}>{tr('Gender', 'Genre')}</Text>
                <View style={styles.segmentRow}>
                  {(['MALE', 'FEMALE', 'OTHER'] as const).map((g) => (
                    <Pressable
                      key={g}
                      onPress={() => updateForm('gender', g)}
                      style={[styles.segmentBtn, form.gender === g ? styles.segmentBtnActive : null]}
                    >
                      <Text style={form.gender === g ? styles.segmentTextActive : styles.segmentText}>{g}</Text>
                    </Pressable>
                  ))}
                </View>

                <Text style={styles.fieldLabel}>{tr('Status', 'Statut')}</Text>
                <View style={styles.segmentWrap}>
                  {(['CRITICAL', 'MODERATE', 'STABLE', 'RECOVERING', 'DISCHARGED'] as const).map((value) => (
                    <Pressable
                      key={value}
                      onPress={() => updateForm('status', value)}
                      style={[styles.segmentBtn, form.status === value ? styles.segmentBtnActive : null]}
                    >
                      <Text style={form.status === value ? styles.segmentTextActive : styles.segmentText}>{value}</Text>
                    </Pressable>
                  ))}
                </View>

                <TextInput
                  style={styles.input}
                  placeholder={tr('Blood type', 'Groupe sanguin')}
                  placeholderTextColor={colors.textMuted}
                  value={form.bloodType}
                  onChangeText={(value) => updateForm('bloodType', value)}
                />
                <TextInput
                  style={[styles.input, styles.multiline]}
                  multiline
                  placeholder={tr('Medical history', 'Historique medical')}
                  placeholderTextColor={colors.textMuted}
                  value={form.medicalHistory}
                  onChangeText={(value) => updateForm('medicalHistory', value)}
                />
                <TextInput
                  style={styles.input}
                  placeholder={tr('Allergies (comma separated)', 'Allergies (separees par virgules)')}
                  placeholderTextColor={colors.textMuted}
                  value={form.allergies}
                  onChangeText={(value) => updateForm('allergies', value)}
                />

                <TextInput
                  style={styles.input}
                  placeholder={tr('Assigned doctor id', 'Id medecin assigne')}
                  placeholderTextColor={colors.textMuted}
                  value={form.assignedDoctorId}
                  onChangeText={(value) => updateForm('assignedDoctorId', value)}
                />
                <TextInput
                  style={styles.input}
                  placeholder={tr('Assigned nurse id', 'Id infirmier assigne')}
                  placeholderTextColor={colors.textMuted}
                  value={form.assignedNurseId}
                  onChangeText={(value) => updateForm('assignedNurseId', value)}
                />
                <TextInput
                  style={styles.input}
                  placeholder={tr('Bed id', 'Id lit')}
                  placeholderTextColor={colors.textMuted}
                  value={form.bedId}
                  onChangeText={(value) => updateForm('bedId', value)}
                />

                {metadata.doctors.length > 0 ? (
                  <View style={styles.quickPickWrap}>
                    <Text style={styles.fieldLabel}>{tr('Quick doctor pick', 'Selection rapide medecin')}</Text>
                    {metadata.doctors.slice(0, 5).map((doctor) => (
                      <Pressable
                        key={doctor._id}
                        style={styles.quickPickBtn}
                        onPress={() => updateForm('assignedDoctorId', doctor._id)}
                      >
                        <Text style={styles.quickPickText}>{tr('Dr.', 'Dr.')} {doctor.firstName} {doctor.lastName}</Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                <View style={styles.modalActionRow}>
                  <Pressable style={styles.secondaryBtn} onPress={resetModal} disabled={isSubmitting}>
                    <Text style={styles.secondaryBtnText}>{tr('Cancel', 'Annuler')}</Text>
                  </Pressable>
                  <Pressable style={styles.primaryBtn} onPress={() => void submitForm()} disabled={isSubmitting}>
                    {isSubmitting ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.primaryBtnText}>{editingPatientId ? tr('Update', 'Mettre a jour') : tr('Create', 'Creer')}</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            )}
          />
        </View>
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
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  muted: {
    color: colors.textMuted,
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  primaryBtn: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 88,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: '#eef2f7',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    minWidth: 88,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: colors.text,
    fontWeight: '700',
  },
  iconBtn: {
    borderRadius: 8,
    backgroundColor: '#eff6ff',
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  iconBtnText: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '700',
  },
  iconBtnDanger: {
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  iconBtnDangerText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  itemActionRow: {
    flexDirection: 'row',
    gap: 6,
  },
  emptyWrap: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  error: {
    color: colors.danger,
    fontSize: 13,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: colors.background,
    padding: 16,
    gap: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
  },
  modalForm: {
    gap: 10,
    paddingBottom: 40,
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
  multiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  fieldLabel: {
    color: colors.text,
    fontWeight: '700',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  segmentBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff',
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  segmentBtnActive: {
    borderColor: colors.primary,
    backgroundColor: '#e0f2fe',
  },
  segmentText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: colors.primaryDark,
    fontSize: 12,
    fontWeight: '700',
  },
  quickPickWrap: {
    gap: 6,
  },
  quickPickBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
  },
  quickPickText: {
    color: colors.text,
    fontSize: 13,
  },
  modalActionRow: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
});
