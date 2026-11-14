import {BUILD_INFO} from '../../../lib/build-info.generated';
export const dynamic='force-dynamic';
export async function GET(){
  return Response.json(BUILD_INFO,{
    headers:{'Cache-Control':'no-store, max-age=0, must-revalidate','X-Content-Type-Options':'nosniff'}
  });
}
