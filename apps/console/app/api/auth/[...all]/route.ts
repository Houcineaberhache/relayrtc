import { getAuthRuntime } from '@/lib/auth-server'

const handleAuthRequest = (request: Request) => getAuthRuntime().handler(request)
export { handleAuthRequest as GET, handleAuthRequest as POST }
