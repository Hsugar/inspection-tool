export const TEST_ITEMS = [
  'MTB',
  'GBS',
  'Flu A',
  'Flu B',
  'NG',
  'MG',
  'CT',
] as const;
export type TestItem = (typeof TEST_ITEMS)[number];
export type PatientInfo = {
  name: string;
  gender: 'male' | 'female' | 'other';
  age: string;
  patientId: string;
  contact: string;
  testItem: TestItem;
};
export type PatientDraft = Omit<PatientInfo, 'gender' | 'testItem'> & {
  gender: PatientInfo['gender'] | '';
  testItem: TestItem | '';
};
export const genderLabels = { male: '男', female: '女', other: '其他' };

/** Start every new capture with an independent, empty patient form. */
export function emptyPatientInfo(): PatientDraft {
  return {
    name: '',
    gender: '',
    age: '',
    patientId: '',
    contact: '',
    testItem: '',
  };
}

export function validatePatientInfo(
  patient: PatientDraft,
): Partial<Record<keyof PatientInfo, string>> {
  const errors: Partial<Record<keyof PatientInfo, string>> = {};
  if (!patient.name.trim()) errors.name = '请输入患者名字';
  if (!['male', 'female', 'other'].includes(patient.gender))
    errors.gender = '请选择患者性别';
  const age = patient.age.trim();
  if (!/^\d{1,3}$/.test(age) || Number(age) > 150)
    errors.age = '请输入 0–150 岁的整数年龄';
  if (!patient.patientId.trim()) errors.patientId = '请输入患者编号';
  if (!patient.contact.trim()) errors.contact = '请输入联系方式';
  if (!(TEST_ITEMS as readonly string[]).includes(patient.testItem))
    errors.testItem = '请选择检测项目';
  return errors;
}

export function normalizePatientInfo(patient: PatientDraft): PatientInfo {
  const errors = validatePatientInfo(patient);
  if (Object.keys(errors).length) throw new Error(Object.values(errors)[0]);
  return {
    name: patient.name.trim(),
    gender: patient.gender as PatientInfo['gender'],
    age: String(Number(patient.age.trim())),
    patientId: patient.patientId.trim(),
    contact: patient.contact.trim(),
    testItem: patient.testItem as TestItem,
  };
}
