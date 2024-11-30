module sample_coin::coin;

use sui::{
	coin::{Self, TreasuryCap},
};

public struct COIN has drop {}

fun init(witness: COIN, ctx: &mut TxContext) {
	let (treasury, metadata) = coin::create_currency(
			witness,
			2,
			b"ZEX",
			b"ZEX sample coin",
			b"sample description",
			option::none(),
			ctx,
	);
	transfer::public_freeze_object(metadata);
	transfer::public_transfer(treasury, ctx.sender())
}

public entry fun mint(
		treasury_cap: &mut TreasuryCap<COIN>,
		amount: u64,
		recipient: address,
		ctx: &mut TxContext,
) {
		let coin = coin::mint(treasury_cap, amount, ctx);
		transfer::public_transfer(coin, recipient)
}

#[test_only] 
use sui::{
	test_scenario::{Self as ts},
};

#[test]
fun test_publisher() {
	let admin = @0xAD;

	let mut scenario = ts::begin(admin);

	init(
		COIN {},
		scenario.ctx()
	);

	scenario.end();
}