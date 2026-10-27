// Funções de servidor do HEILOG (Firebase Cloud Functions).
//
// redefinirPin: um administrador gera um PIN temporário para outro usuário que
// esqueceu o PIN. Só o servidor pode trocar a senha de outra conta, por isso isto
// não fica no site. No próximo login a pessoa é obrigada a criar um PIN novo.
const {onCall, HttpsError} = require('firebase-functions/v2/https');
const {setGlobalOptions} = require('firebase-functions/v2');
const {initializeApp} = require('firebase-admin/app');
const {getAuth} = require('firebase-admin/auth');
const {getFirestore, FieldValue} = require('firebase-admin/firestore');
const {randomInt} = require('node:crypto');

initializeApp();
setGlobalOptions({region: 'southamerica-east1', maxInstances: 5});

const OWNER_EMAIL = 'joelamerico6@gmail.com';
const OWNER_USERNAME = 'joel.0609';
const USERS_PATH = 'artifacts/heilog-logistica/public/data/usuarios';
const LEGACY_USERS_PATH = 'usuarios';
const AUDIT_PATH = 'artifacts/heilog-logistica/public/data/auditoria_acessos';
const DEFAULT_UNIT_ID = 'jacarei';

const norm = (value) => String(value ?? '').trim().toLowerCase();

async function readProfile(db, uid) {
  for (const path of [USERS_PATH, LEGACY_USERS_PATH]) {
    const ref = db.doc(`${path}/${uid}`);
    const snap = await ref.get();
    if (snap.exists) return {ref, data: snap.data() || {}};
  }
  return null;
}

function unitIds(profile) {
  const explicit = Array.isArray(profile.unidades) ? profile.unidades.map(norm).filter(Boolean) : [];
  if (explicit.includes('*')) return ['*'];
  if (explicit.length) return explicit;
  return [norm(profile.unidadeSolicitada) || DEFAULT_UNIT_ID];
}

function isBlocked(profile) {
  const role = norm(profile.role || profile.perfil);
  const status = norm(profile.status);
  return profile.ativo === false || profile.aprovado === false ||
    ['pendente', 'bloqueado'].includes(role) || ['pendente', 'bloqueado', 'inativo'].includes(status);
}

const isGlobalAdmin = (email, profile) =>
  norm(email) === OWNER_EMAIL || profile?.globalAdmin === true || profile?.proprietario === true;

const isOwnerProfile = (profile) =>
  profile?.proprietario === true || norm(profile?.username) === OWNER_USERNAME;

// PIN aleatório de 6 dígitos, evitando os fáceis de adivinhar (111111, 123456...).
function temporaryPin() {
  for (;;) {
    const pin = String(randomInt(0, 1_000_000)).padStart(6, '0');
    if (/^(\d)\1{5}$/.test(pin)) continue;
    if ('0123456789012345'.includes(pin) || '9876543210987654'.includes(pin)) continue;
    return pin;
  }
}

exports.redefinirPin = onCall(async (request) => {
  const callerUid = request.auth?.uid;
  const callerEmail = request.auth?.token?.email;
  if (!callerUid) throw new HttpsError('unauthenticated', 'Entre no painel para continuar.');

  const targetUid = String(request.data?.uid || '');
  if (!/^[A-Za-z0-9]{10,128}$/.test(targetUid)) throw new HttpsError('invalid-argument', 'Usuário inválido.');
  if (targetUid === callerUid) {
    throw new HttpsError('failed-precondition', 'Para trocar o seu próprio PIN use "Alterar senha" em Minha conta.');
  }

  const db = getFirestore();
  const caller = await readProfile(db, callerUid);
  const callerProfile = caller?.data || {};
  const callerGlobal = isGlobalAdmin(callerEmail, callerProfile);
  const callerUnitAdmin = norm(callerProfile.role || callerProfile.perfil) === 'admin' && !isBlocked(callerProfile);
  if (!callerGlobal && !callerUnitAdmin) {
    throw new HttpsError('permission-denied', 'Só administradores podem redefinir PIN.');
  }

  const target = await readProfile(db, targetUid);
  if (!target) throw new HttpsError('not-found', 'Perfil do usuário não encontrado.');
  if (isOwnerProfile(target.data) || isGlobalAdmin('', target.data)) {
    throw new HttpsError('permission-denied', 'Esta conta é protegida e não pode ter o PIN redefinido por aqui.');
  }
  if (!callerGlobal) {
    // Admin de unidade só redefine PIN de quem é da mesma unidade e não é admin geral.
    const mine = unitIds(callerProfile);
    const theirs = unitIds(target.data);
    const shared = mine.includes('*') || theirs.some((unit) => mine.includes(unit));
    if (!shared) throw new HttpsError('permission-denied', 'Este usuário não é da sua unidade.');
  }

  const pin = temporaryPin();
  try {
    await getAuth().updateUser(targetUid, {password: pin});
    await getAuth().revokeRefreshTokens(targetUid); // derruba sessões abertas com o PIN antigo
  } catch (error) {
    if (error?.code === 'auth/user-not-found') {
      throw new HttpsError('not-found', 'A conta de login deste usuário não existe mais. Peça para ele solicitar acesso de novo.');
    }
    throw new HttpsError('internal', 'Não foi possível redefinir o PIN agora.');
  }

  const callerUsername = norm(callerProfile.username) || (norm(callerEmail) === OWNER_EMAIL ? OWNER_USERNAME : callerUid);
  await target.ref.set({
    deveTrocarPin: true,
    pinRedefinidoEm: FieldValue.serverTimestamp(),
    pinRedefinidoPorUid: callerUid,
    pinRedefinidoPorUsuario: callerUsername
  }, {merge: true});
  await db.collection(AUDIT_PATH).add({
    acao: 'redefinir_pin',
    alvoUid: targetUid,
    alvoUsuario: norm(target.data.username),
    porUid: callerUid,
    porUsuario: callerUsername,
    em: FieldValue.serverTimestamp()
  });

  return {pinTemporario: pin};
});
