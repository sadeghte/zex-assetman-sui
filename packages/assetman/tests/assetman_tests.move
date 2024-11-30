#[test_only]
module zex_assetman::assetman_tests;
// uncomment this line to import the module
// use zex_assetman::{assetman}

const ENotImplemented: u64 = 0;


#[test_only] 
use sui::{
	sui::SUI,
	test_scenario::{Self as ts, Scenario, next_tx},
	coin::{Self, Coin},
	ed25519,
	ed25519_tests,
	// balance::{Self, Balance},
};
#[test_only]
use zex_assetman::{
	assetman::{
		Self,
		ASSETMAN,
		Sudo,
		Vault,
		add_vault,
		deposit,
		withdraw,
		// get_ASSETMAN,
		vault_value,
	}
};

#[test_only] public struct COIN1 has drop {}
#[test_only] public struct COIN2 has drop {}

#[test_only] const TE: u64 = 0x1;

#[test_only]
fun mint_test<COIN>(amount: u64, ts: &mut Scenario): Coin<COIN> {
	coin::mint_for_testing<COIN>(amount, ts.ctx())
}

#[test_only]
fun burn_test<COIN>(coin: Coin<COIN>) {
	coin::burn_for_testing(coin);
}

#[test]
fun test_zex_assetman() {
    // pass
}

#[test, expected_failure(abort_code = ::zex_assetman::assetman_tests::ENotImplemented)]
fun test_zex_assetman_fail() {
    abort ENotImplemented
}

#[test]
fun vault_test() {
	let key = x"5555555555555555555555555555555555555555555555555555555555555555";
	// let pubkey = ed25519_tests;
	let withdraw_validator = x"55";

	let admin = @0xAD;
	let user = @0x123;

	let mut scenario = ts::begin(admin);

	assetman::init_test(scenario.ctx());
	next_tx(&mut scenario, admin);

	let mut sudo = ts::take_from_sender<Sudo<ASSETMAN>>(&scenario);
	
	let coin1:Coin<SUI> = mint_test(1, &mut scenario);
	add_vault(&mut sudo, coin1, scenario.ctx());
	
	let coin2:Coin<COIN1> = mint_test(1, &mut scenario);
	add_vault(&mut sudo, coin2, scenario.ctx());
	
	let coin3:Coin<COIN2> = mint_test(1, &mut scenario);
	add_vault(&mut sudo, coin3, scenario.ctx());

	next_tx(&mut scenario, admin);
	let mut vault1 = ts::take_shared<Vault<SUI>>(&scenario);
	let mut vault2 = ts::take_shared<Vault<COIN1>>(&scenario);
	let mut vault3 = ts::take_shared<Vault<COIN2>>(&scenario);

	next_tx(&mut scenario, user);

	let mut u_coin1:Coin<SUI> = mint_test(100, &mut scenario);
	let mut u_coin2:Coin<COIN1> = mint_test(100, &mut scenario);
	let mut u_coin3:Coin<COIN2> = mint_test(100, &mut scenario);

	deposit(&mut vault1, &mut u_coin1, 50 , scenario.ctx());
	deposit(&mut vault2, &mut u_coin2, 60 , scenario.ctx());
	deposit(&mut vault3, &mut u_coin3, 70 , scenario.ctx());

	next_tx(&mut scenario, user);

	assert!(vault_value(&vault1) == 50 + 1, TE);
	assert!(vault_value(&vault2) == 60 + 1, TE);
	assert!(vault_value(&vault3) == 70 + 1, TE);

	assert!(coin::value(&u_coin1) == 50, TE);
	assert!(coin::value(&u_coin2) == 40, TE);
	assert!(coin::value(&u_coin3) == 30, TE);

	u_coin1.join(withdraw(&mut vault1, 50, scenario.ctx()));
	u_coin2.join(withdraw(&mut vault2, 60, scenario.ctx()));
	u_coin3.join(withdraw(&mut vault3, 70, scenario.ctx()));

	next_tx(&mut scenario, user);

	assert!(vault_value(&vault1) == 1, TE);
	assert!(vault_value(&vault2) == 1, TE);
	assert!(vault_value(&vault3) == 1, TE);

	assert!(coin::value(&u_coin1) == 100, TE);
	assert!(coin::value(&u_coin2) == 100, TE);
	assert!(coin::value(&u_coin3) == 100, TE);

	burn_test(u_coin1);
	burn_test(u_coin2);
	burn_test(u_coin3);
		
	ts::return_shared(vault1);
	ts::return_shared(vault2);
	ts::return_shared(vault3);
	ts::return_to_address<Sudo<ASSETMAN>>(admin, sudo);

	scenario.end();
}
