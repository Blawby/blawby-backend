/**
 * Metered Billing Test Script
 *
 * Tests the complete flow:
 * 1. Better Auth subscription creation via API
 * 2. Triggering a metered feature (member invitation)
 * 3. Verifying metered product attachment
 * 4. Checking usage reporting
 */

import { config } from '@dotenvx/dotenvx';
config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';
const TEST_ORG_ID = process.env.TEST_ORG_ID || '';

if (!AUTH_TOKEN) {
  console.error('❌ AUTH_TOKEN environment variable is required');
  console.log('💡 Set it in .env or pass it as: AUTH_TOKEN=xxx pnpm run test:metered');
  process.exit(1);
}

if (!TEST_ORG_ID) {
  console.error('❌ TEST_ORG_ID environment variable is required');
  console.log('💡 Set it in .env or pass it as: TEST_ORG_ID=xxx pnpm run test:metered');
  process.exit(1);
}

/**
 * Helper to make API calls
 */
const apiCall = async (
  endpoint: string,
  options: RequestInit = {},
): Promise<{ data: unknown; status: number }> => {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${AUTH_TOKEN}`,
    ...options.headers,
  };

  console.log(`\n📤 ${options.method || 'GET'} ${endpoint}`);

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    console.error(`❌ ${response.status} ${response.statusText}`);
    console.error('Response:', data);
  } else {
    console.log(`✅ ${response.status} ${response.statusText}`);
  }

  return { data, status: response.status };
};

/**
 * Main test flow
 */
const runTests = async (): Promise<void> => {
  console.log('🧪 Metered Billing Test Suite\n');
  console.log('Configuration:');
  console.log(`  API: ${API_BASE_URL}`);
  console.log(`  Organization: ${TEST_ORG_ID}`);
  console.log(`  Token: ${AUTH_TOKEN.slice(0, 10)}...`);

  try {
    // Test 1: Check current subscription
    console.log('\n\n📋 Test 1: Check Current Subscription');
    console.log('─'.repeat(60));

    const { data: currentSub, status: subStatus } = await apiCall(
      '/api/subscriptions/current',
      { method: 'GET' },
    );

    if (subStatus !== 200) {
      console.warn('⚠️  No active subscription found');
      console.log('💡 Create a subscription first using Better Auth SDK or API');
      console.log('   Example: POST /api/subscriptions/create');
      return;
    }

    console.log('Subscription details:', JSON.stringify(currentSub, null, 2));

    // Test 2: Get available plans
    console.log('\n\n📋 Test 2: Get Available Plans');
    console.log('─'.repeat(60));

    const { data: plans } = await apiCall('/api/subscriptions/plans', {
      method: 'GET',
    });

    console.log(`Found ${(plans as { plans?: unknown[] })?.plans?.length || 0} plans`);
    console.log('Plans:', JSON.stringify(plans, null, 2));

    // Check if any plans have metered items configured
    const plansWithMetered = (plans as { plans?: Array<{ name: string; meteredItems?: unknown[] }> })
      ?.plans?.filter((p) => p.meteredItems && p.meteredItems.length > 0) || [];

    if (plansWithMetered.length === 0) {
      console.warn('⚠️  No plans have metered items configured');
      console.log('💡 Add metered items to plans in database:');
      console.log('   UPDATE subscription_plans SET metered_items = \'[...]\'::jsonb');
      console.log('   See METERED_BILLING_GUIDE.md for details');
    } else {
      console.log(`✅ ${plansWithMetered.length} plan(s) have metered items configured`);
      plansWithMetered.forEach((plan) => {
        console.log(`   ${plan.name}: ${plan.meteredItems?.length || 0} metered items`);
      });
    }

    // Test 3: Trigger metered feature (invite a member)
    console.log('\n\n📋 Test 3: Trigger Metered Feature (Invite Member)');
    console.log('─'.repeat(60));

    const testEmail = `test-${Date.now()}@example.com`;
    console.log(`Inviting: ${testEmail}`);

    const { data: invitation, status: inviteStatus } = await apiCall(
      `/api/practice/${TEST_ORG_ID}/invitations`,
      {
        method: 'POST',
        body: JSON.stringify({
          email: testEmail,
          role: 'member',
        }),
      },
    );

    if (inviteStatus === 201 || inviteStatus === 200) {
      console.log('✅ Member invitation created successfully');
      console.log('Invitation:', JSON.stringify(invitation, null, 2));
      console.log(
        '\n💡 This should have triggered metered usage reporting',
      );
      console.log('   Check logs for: "📊 Usage reported: user_seat +1"');
    } else {
      console.error('❌ Failed to create invitation');
    }

    // Test 4: Check subscription details (should show line items)
    console.log('\n\n📋 Test 4: Verify Metered Product Attachment');
    console.log('─'.repeat(60));

    const subscriptionId = (
      currentSub as {
        subscription?: { id?: string; stripeSubscriptionId?: string };
      }
    )?.subscription?.id || (
      currentSub as {
        subscription?: { id?: string; stripeSubscriptionId?: string };
      }
    )?.subscription?.stripeSubscriptionId;

    if (!subscriptionId) {
      console.error('❌ No subscription ID found');
      return;
    }

    const { data: subDetails } = await apiCall(
      `/api/subscriptions/${subscriptionId}`,
      { method: 'GET' },
    );

    const lineItems = (
      subDetails as {
        subscription?: { lineItems?: Array<{ itemType: string; quantity: number }> };
      }
    )?.subscription?.lineItems || [];

    console.log(`Found ${lineItems.length} line item(s):`);
    lineItems.forEach((item) => {
      console.log(`  - ${item.itemType}: quantity ${item.quantity}`);
    });

    const meteredItems = lineItems.filter((item) =>
      item.itemType.startsWith('metered_'),
    );

    if (meteredItems.length > 0) {
      console.log(`\n✅ ${meteredItems.length} metered product(s) attached!`);
      meteredItems.forEach((item) => {
        console.log(`   ✅ ${item.itemType}: ${item.quantity} unit(s)`);
      });
    } else {
      console.warn('\n⚠️  No metered products attached yet');
      console.log('💡 Possible reasons:');
      console.log('   1. Plan doesn\'t have metered items configured');
      console.log('   2. Feature hasn\'t been used yet (lazy attachment)');
      console.log('   3. Stripe API call failed (check logs)');
    }

    // Test 5: Summary
    console.log('\n\n📊 Test Summary');
    console.log('─'.repeat(60));

    const results = {
      hasActiveSubscription: subStatus === 200,
      plansWithMeteredConfig: plansWithMetered.length,
      invitationCreated: inviteStatus === 201 || inviteStatus === 200,
      meteredItemsAttached: meteredItems.length,
      totalLineItems: lineItems.length,
    };

    console.log(JSON.stringify(results, null, 2));

    if (
      results.hasActiveSubscription
      && results.plansWithMeteredConfig > 0
      && results.meteredItemsAttached > 0
    ) {
      console.log('\n🎉 SUCCESS! Metered billing is working correctly');
    } else {
      console.log('\n⚠️  Some issues detected. See details above.');
    }

    console.log('\n💡 Next Steps:');
    console.log('   1. Check Stripe Dashboard → Subscriptions');
    console.log('   2. Find this subscription and verify metered items');
    console.log('   3. Check database: SELECT * FROM subscription_line_items');
    console.log('   4. Monitor logs for usage reporting');
  } catch (error) {
    console.error('\n❌ Test failed with error:', error);
    if (error instanceof Error) {
      console.error('Message:', error.message);
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
};

// Run tests
runTests().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

