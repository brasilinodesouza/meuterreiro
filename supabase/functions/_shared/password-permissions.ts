// A redefinição de senha concede acesso à conta de destino. Preserve a hierarquia
// também no servidor; a senha do responsável só muda pela própria sessão.
export function canResetHousePassword(actorRole: unknown, targetRole: unknown): boolean {
  if (actorRole === 'responsavel') return targetRole === 'usuario' || targetRole === 'administrador';
  return actorRole === 'administrador' && targetRole === 'usuario';
}
