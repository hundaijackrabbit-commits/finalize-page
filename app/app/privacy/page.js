'use client';
import { AppShell } from '../../../components/app-shell';
import { PrivacyCenter } from '../../../components/privacy-center';
import { useFinalizeStore } from '../../../lib/finalize-store';

export default function PrivacyPage(){const store=useFinalizeStore();return <AppShell workspace={store.workspace} finalizations={store.finalizations} activeSection="privacy"><PrivacyCenter store={store}/></AppShell>;}
