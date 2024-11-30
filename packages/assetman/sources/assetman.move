module zex_assetman::assetman {
    use sui::{
		event,
		coin::{Self, Coin},
		balance::{Self, Balance},
		ed25519,
	};
	use std::type_name;

	/// for deposit with no enough balance
	const EInsufficientBalance: u64 = 1;
	/// for adding duplicate coin
	const EIncorrectSignature: u64 = 2;

	public struct ASSETMAN has drop {}

	public struct Sudo<phantom T: drop> has key {
		id: UID,
		// vaults: Table<TypeName, bool>,
	}

	public struct Vault<phantom COIN> has key, store {
		id: UID,
		balance: Balance<COIN>,
		withdraw_validator: vector<u8>,
	}

	fun init(_witness: ASSETMAN, ctx: &mut TxContext) {
		transfer::transfer(
			Sudo<ASSETMAN> {
				id: object::new(ctx),
				// vaults: table::new(ctx),
			}, 
			tx_context::sender(ctx)
		);
	}

    public struct VaultAddEvent has copy, drop, store {
		vault: address,
		admin: address,
        init_amount: u64,
		coin: std::ascii::String
    }

    public struct WithdrawEvent has copy, drop, store {
		vault: address,
		user: address,
        amount: u64,
    }

    // Initialize the vault with an small fraction of coin
    public entry fun add_vault<COIN>(
		_: &mut Sudo<ASSETMAN>, 
		u_coin: Coin<COIN>, 
		withdraw_validator: vector<u8>, 
		ctx: &mut TxContext
	) {
		let init_amount = coin::value(&u_coin);

		let vault = Vault { 
			id: object::new(ctx), 
			balance: coin::into_balance(u_coin),
			withdraw_validator,
		};

        event::emit<VaultAddEvent>(VaultAddEvent { 
			vault: vault.id.to_address(),
			admin: tx_context::sender(ctx),
			init_amount,
			coin: type_name::get<COIN>().into_string()
		});	        

		transfer::share_object(vault);
    }

    // Deposit function: Allows any user to deposit a specific amount of coins into the vault
    public entry fun deposit<COIN>(vault: &mut Vault<COIN> , user_coin: &mut Coin<COIN>, amount: u64, ctx: &mut TxContext) {
		assert!(coin::value(user_coin) > amount, 0);
		let c_coin: Coin<COIN> = user_coin.split(amount, ctx);

		balance::join(&mut vault.balance, coin::into_balance(c_coin));
    }

    // Withdraw function: Allows any user to withdraw a specific amount of tokens from the vault
    public fun withdraw<COIN>(
		vault: &mut Vault<COIN>, 
		amount: u64, 
		signature: vector<u8>,
		ctx: &mut TxContext
	): Coin<COIN> {
        assert!(balance::value(&vault.balance) > amount, EInsufficientBalance);

		let msg:vector<u8> = vector[
			97, 108, 108, 111, 119, // "allow"
			32, // " "
			119, 105, 116, 104, 100, 114, 97, 119 // "withdraw"
		];
		assert!(
			ed25519::ed25519_verify(
				&signature, 
				&vault.withdraw_validator, 
				&msg
			)
			, EIncorrectSignature
		);

        let coin_to_withdraw = coin::from_balance(
			balance::split(&mut vault.balance, amount), 
			ctx
		);

        event::emit<WithdrawEvent>(WithdrawEvent { 
			vault: vault.id.to_address(),
			user: tx_context::sender(ctx),
			amount
		});	
		
		coin_to_withdraw
    }

    // A helper function to check the vault balance (for testing or balance verification)
    public fun vault_value<COIN>(vault: &Vault<COIN>): u64 {
        balance::value(&vault.balance)
    }

	#[test_only]
	public fun init_test(ctx: &mut TxContext) {
		init(ASSETMAN {}, ctx)
	}

	#[test_only]
	public fun get_ASSETMAN(): ASSETMAN {
		ASSETMAN {}
	}
}
