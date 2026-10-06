import { createClient } from '@supabase/supabase-js'

const memberCodes = ['vendra', 'acan', 'hudda', 'adit', 'henry']
const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const initialPin = process.env.FIELD_LOG_INITIAL_PIN

if (!supabaseUrl || !serviceRoleKey || !initialPin) {
  throw new Error(
    'Isi SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, dan FIELD_LOG_INITIAL_PIN melalui environment terminal.',
  )
}

if (!/^\d{4}$/.test(initialPin)) {
  throw new Error('FIELD_LOG_INITIAL_PIN harus tepat empat digit.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: existingUsers, error: listError } =
  await supabase.auth.admin.listUsers({ perPage: 1000 })

if (listError) throw listError

for (const memberCode of memberCodes) {
  const email = `${memberCode}@fieldlog.internal`
  const password = `field-log/${memberCode}/${initialPin}`
  const existingUser = existingUsers.users.find((user) => user.email === email)

  if (existingUser) {
    const { data, error } = await supabase.auth.admin.updateUserById(existingUser.id, {
      password,
      email_confirm: true,
      user_metadata: { member_code: memberCode },
    })
    if (error) throw error
    await addToTeam(data.user.id, memberCode)
    console.log(`Diperbarui dan diizinkan: ${memberCode}`)
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { member_code: memberCode },
    })
    if (error) throw error
    await addToTeam(data.user.id, memberCode)
    console.log(`Dibuat dan diizinkan: ${memberCode}`)
  }
}

console.log('Lima akun Log Lapangan siap digunakan.')

async function addToTeam(userId, memberCode) {
  const { error } = await supabase
    .from('team_members')
    .upsert({ user_id: userId, member_code: memberCode })
  if (error) throw error
}
