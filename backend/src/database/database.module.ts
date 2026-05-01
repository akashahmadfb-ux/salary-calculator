import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';

export const SUPABASE_CLIENT = 'SUPABASE_CLIENT';

@Module({
  providers: [
    {
      provide: SUPABASE_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.getOrThrow<string>('SUPABASE_URL');
        const key = config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');
        return createClient(url, key, {
          auth: { persistSession: false },
        });
      },
    },
  ],
  exports: [SUPABASE_CLIENT],
})
export class DatabaseModule {}
