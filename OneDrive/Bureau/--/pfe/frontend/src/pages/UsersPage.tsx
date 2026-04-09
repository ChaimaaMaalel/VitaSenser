import { useEffect, useState, ChangeEvent, FormEvent } from 'react';
import { UserCog, Stethoscope, Users, UserCheck, Plus, Trash2, Pencil, X, Search } from 'lucide-react';
import StatsCard from '../components/dashboard/StatsCard';
import api from '../lib/api';
import { resolveMediaUrl } from '../lib/media';
import toast from 'react-hot-toast';
import { useLanguageStore } from '../store/languageStore';

interface DirectoryUser {
  _id?: string;
  id?: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  profilePicture?: string;
  role: 'ADMIN' | 'DOCTOR' | 'NURSE';
  isActive?: boolean;
  specialization?: string;
  licenseNumber?: string;
  shift?: string;
  certificationLevel?: string;
  department?: string;
}

interface DashboardStats {
  patients: {
    total: number;
    active: number;
    critical: number;
  };
  alerts: {
    active: number;
    critical: number;
  };
  beds: {
    total: number;
    occupied: number;
    available: number;
    occupancyRate: number;
  };
}

interface FormData {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  password?: string;
  role: 'ADMIN' | 'DOCTOR' | 'NURSE';
  specialization?: string;
  licenseNumber?: string;
  shift?: string;
  certificationLevel?: string;
  department?: string;
}

const initialFormState: FormData = {
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

export default function UsersPage() {
  const language = useLanguageStore((state) => state.language);
  const tr = (en: string, fr: string) => (language === 'fr' ? fr : en);
  const [users, setUsers] = useState<DirectoryUser[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<DirectoryUser | null>(null);
  const [formData, setFormData] = useState<FormData>(initialFormState);
  const [profilePictureFile, setProfilePictureFile] = useState<File | null>(null);
  const [profilePicturePreview, setProfilePicturePreview] = useState('');
  const [removeProfilePicture, setRemoveProfilePicture] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'DOCTOR' | 'NURSE'>('ALL');

  const getInitials = (firstName?: string, lastName?: string) =>
    `${(firstName || '').charAt(0)}${(lastName || '').charAt(0)}`.toUpperCase() || 'U';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersRes, statsRes] = await Promise.all([
        api.get('/users'),
        api.get('/dashboard/stats'),
      ]);
      setUsers(usersRes.data.data.users || []);
      setStats(statsRes.data.data);
    } catch (error) {
      console.error('Failed to load data');
      toast.error(tr('Failed to load data', 'Echec du chargement des donnees'));
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (user?: DirectoryUser) => {
    if (user) {
      setEditingUser(user);
      setFormData({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone || '',
        role: user.role,
        specialization: user.specialization || '',
        licenseNumber: user.licenseNumber || '',
        shift: user.shift || 'DAY',
        certificationLevel: user.certificationLevel || '',
        department: user.department || '',
      });
      setProfilePicturePreview(resolveMediaUrl(user.profilePicture));
    } else {
      setEditingUser(null);
      setFormData(initialFormState);
      setProfilePicturePreview('');
    }
    setProfilePictureFile(null);
    setRemoveProfilePicture(false);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingUser(null);
    setFormData(initialFormState);
    setProfilePictureFile(null);
    setProfilePicturePreview('');
    setRemoveProfilePicture(false);
  };

  const handleInputChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleProfilePictureChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null;
    setProfilePictureFile(file);
    setRemoveProfilePicture(false);

    if (file) {
      setProfilePicturePreview(URL.createObjectURL(file));
      return;
    }

    if (editingUser?.profilePicture) {
      setProfilePicturePreview(resolveMediaUrl(editingUser.profilePicture));
      return;
    }

    setProfilePicturePreview('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!formData.email || !formData.firstName || !formData.lastName) {
      toast.error(tr('Please fill in required fields', 'Veuillez remplir les champs obligatoires'));
      return;
    }

    try {
      setSubmitting(true);

      const payload = new FormData();
      payload.append('email', formData.email);
      payload.append('firstName', formData.firstName);
      payload.append('lastName', formData.lastName);
      payload.append('phone', formData.phone || '');
      payload.append('role', formData.role);
      payload.append('specialization', formData.specialization || '');
      payload.append('licenseNumber', formData.licenseNumber || '');
      payload.append('shift', formData.shift || 'DAY');
      payload.append('certificationLevel', formData.certificationLevel || '');
      payload.append('department', formData.department || '');

      if (profilePictureFile) {
        payload.append('profilePicture', profilePictureFile);
      } else if (editingUser && removeProfilePicture) {
        payload.append('removeProfilePicture', 'true');
      }
      
      if (editingUser) {
        await api.put(`/users/${editingUser._id || editingUser.id}`, payload);
        toast.success(tr('User updated successfully', 'Utilisateur mis a jour avec succes'));
      } else {
        if (!formData.password) {
          toast.error(tr('Password is required for new user', 'Le mot de passe est requis pour un nouvel utilisateur'));
          return;
        }
        payload.append('password', formData.password);
        await api.post('/auth/register', payload);
        toast.success(tr('User created successfully', 'Utilisateur cree avec succes'));
      }
      
      await fetchData();
      handleCloseModal();
    } catch (error: any) {
      const message = error.response?.data?.error?.message || tr('Failed to save user', 'Echec de sauvegarde de utilisateur');
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!confirm(tr('Are you sure you want to delete this user?', 'Voulez-vous vraiment supprimer cet utilisateur ?'))) {
      return;
    }

    try {
      await api.delete(`/users/${userId}`);
      toast.success(tr('User deleted successfully', 'Utilisateur supprime avec succes'));
      await fetchData();
    } catch (error: any) {
      const message = error.response?.data?.error?.message || tr('Failed to delete user', 'Echec de suppression de utilisateur');
      toast.error(message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const totalUsers = users.filter((u) => u.role !== 'ADMIN').length;
  const doctorCount = users.filter((user) => user.role === 'DOCTOR').length;
  const nurseCount = users.filter((user) => user.role === 'NURSE').length;

  // Filter users excluding admins
  const filteredUsers = users.filter((user) => {
    // Exclude admin users from display
    if (user.role === 'ADMIN') return false;

    // Apply role filter
    if (roleFilter !== 'ALL' && user.role !== roleFilter) return false;

    // Apply search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesName =
        user.firstName.toLowerCase().includes(searchLower) ||
        user.lastName.toLowerCase().includes(searchLower);
      const matchesEmail = user.email.toLowerCase().includes(searchLower);
      const matchesPhone = user.phone?.toLowerCase().includes(searchLower);

      return matchesName || matchesEmail || matchesPhone;
    }

    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <UserCog className="w-8 h-8 text-purple-500" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{tr('User Management', 'Gestion des utilisateurs')}</h1>
            <p className="text-gray-600 mt-1">{tr('Manage doctors, nurses, and admins', 'Gerer les medecins, infirmiers et administrateurs')}</p>
          </div>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition"
        >
          <Plus className="w-5 h-5" />
          {tr('Add User', 'Ajouter utilisateur')}
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatsCard
          title={tr('Total Staff', 'Personnel total')}
          value={totalUsers}
          subtitle={tr('Doctors & Nurses', 'Medecins & infirmiers')}
          icon={Users}
          color="blue"
        />
        <StatsCard
          title={tr('Total Patients', 'Total patients')}
          value={stats?.patients.total || 0}
          subtitle={tr(`${stats?.patients.active || 0} active`, `${stats?.patients.active || 0} actifs`)}
          icon={Users}
          color="green"
        />
        <StatsCard
          title={tr('Doctors', 'Medecins')}
          value={doctorCount}
          subtitle={tr('Medical staff', 'Personnel medical')}
          icon={Stethoscope}
          color="blue"
        />
        <StatsCard
          title={tr('Nurses', 'Infirmiers')}
          value={nurseCount}
          subtitle={tr('Care team', 'Equipe de soins')}
          icon={UserCheck}
          color="purple"
        />
      </div>

      {/* Users Table */}
      <div className="card">
        {/* Search and Filter Controls */}
        <div className="mb-6 flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="flex-1 relative w-full">
            <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder={tr('Search by name, email, or phone...', 'Rechercher par nom, email ou telephone...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as 'ALL' | 'DOCTOR' | 'NURSE')}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent whitespace-nowrap"
          >
            <option value="ALL">{tr('All Roles', 'Tous les roles')}</option>
            <option value="DOCTOR">{tr('Doctors', 'Medecins')}</option>
            <option value="NURSE">{tr('Nurses', 'Infirmiers')}</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-gray-200 bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">{tr('Name', 'Nom')}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">{tr('Email', 'Email')}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">{tr('Role', 'Role')}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">{tr('Phone', 'Telephone')}</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">{tr('Department', 'Departement')}</th>
                <th className="px-6 py-3 text-center text-sm font-semibold text-gray-900">{tr('Actions', 'Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                    {searchTerm || roleFilter !== 'ALL'
                      ? tr('No users match your search or filter', 'Aucun utilisateur ne correspond a votre recherche ou filtre')
                      : tr('No users found', 'Aucun utilisateur trouve')}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user._id || user.id} className="border-b border-gray-200 hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-900 font-medium">
                      <div className="flex items-center gap-3">
                        {user.profilePicture ? (
                          <img
                            src={resolveMediaUrl(user.profilePicture)}
                            alt={`${user.firstName} ${user.lastName}`}
                            className="h-9 w-9 rounded-full object-cover border border-gray-200"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center text-xs font-semibold">
                            {getInitials(user.firstName, user.lastName)}
                          </div>
                        )}
                        <span>
                          {user.firstName} {user.lastName}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                    <td className="px-6 py-4 text-sm">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.role === 'DOCTOR'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{user.phone || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{user.department || '-'}</td>
                    <td className="px-6 py-4 text-sm text-center">
                      <button
                        onClick={() => handleOpenModal(user)}
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 mr-3"
                        title={tr('Edit', 'Modifier')}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user._id || user.id || '')}
                        className="inline-flex items-center gap-1 text-red-600 hover:text-red-800"
                        title={tr('Delete', 'Supprimer')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-900">
                {editingUser ? 'Edit User' : 'Add New User'}
                {editingUser ? tr('Edit User', 'Modifier utilisateur') : tr('Add New User', 'Ajouter utilisateur')}
              </h2>
              <button
                onClick={handleCloseModal}
                className="text-gray-500 hover:text-gray-700"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  {tr('Email', 'Email')} *
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  disabled={!!editingUser}
                  autoComplete="off"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">
                    {tr('First Name', 'Prenom')} *
                  </label>
                  <input
                    type="text"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">
                    {tr('Last Name', 'Nom')} *
                  </label>
                  <input
                    type="text"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  {tr('Phone', 'Telephone')}
                </label>
                <input
                  type="tel"
                  name="phone"
                  value={formData.phone}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  {tr('Profile Picture', 'Photo de profil')}
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleProfilePictureChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
                {profilePicturePreview && !removeProfilePicture && (
                  <img
                    src={profilePicturePreview}
                    alt="Profile preview"
                    className="h-16 w-16 rounded-full object-cover border border-gray-200"
                  />
                )}
                {editingUser && (
                  <label className="inline-flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={removeProfilePicture}
                      onChange={(event) => setRemoveProfilePicture(event.target.checked)}
                    />
                    {tr('Remove current picture', 'Supprimer la photo actuelle')}
                  </label>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  {tr('Role', 'Role')} *
                </label>
                <select
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  required
                >
                  <option value="DOCTOR">{tr('Doctor', 'Medecin')}</option>
                  <option value="NURSE">{tr('Nurse', 'Infirmier')}</option>
                 
                </select>
              </div>

              {formData.role === 'DOCTOR' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">
                      {tr('Specialization', 'Specialite')}
                    </label>
                    <input
                      type="text"
                      name="specialization"
                      value={formData.specialization || ''}
                      onChange={handleInputChange}
                      placeholder={tr('e.g., Cardiology', 'ex: Cardiologie')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">
                      {tr('License Number', 'Numero de licence')}
                    </label>
                    <input
                      type="text"
                      name="licenseNumber"
                      value={formData.licenseNumber || ''}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </>
              )}

              {formData.role === 'NURSE' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">
                      {tr('Shift', 'Service')}
                    </label>
                    <select
                      name="shift"
                      value={formData.shift || 'DAY'}
                      onChange={handleInputChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    >
                      <option value="DAY">{tr('Day', 'Jour')}</option>
                      <option value="NIGHT">{tr('Night', 'Nuit')}</option>
                      <option value="EVENING">{tr('Evening', 'Soir')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 mb-1">
                      {tr('Certification Level', 'Niveau de certification')}
                    </label>
                    <input
                      type="text"
                      name="certificationLevel"
                      value={formData.certificationLevel || ''}
                      onChange={handleInputChange}
                      placeholder={tr('e.g., RN, LPN', 'ex: RN, LPN')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-900 mb-1">
                  {tr('Department', 'Departement')}
                </label>
                <input
                  type="text"
                  name="department"
                  value={formData.department || ''}
                  onChange={handleInputChange}
                  placeholder={tr('e.g., Emergency, ICU', 'ex: Urgence, ICU')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-sm font-medium text-gray-900 mb-1">
                    {tr('Password', 'Mot de passe')} *
                  </label>
                  <input
                    type="password"
                    name="password"
                    value={formData.password || ''}
                    onChange={handleInputChange}
                    autoComplete="new-password"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required={!editingUser}
                  />
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition font-medium"
                >
                  {tr('Cancel', 'Annuler')}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white rounded-lg transition font-medium"
                >
                  {submitting ? tr('Saving...', 'Enregistrement...') : editingUser ? tr('Update', 'Mettre a jour') : tr('Create', 'Creer')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
