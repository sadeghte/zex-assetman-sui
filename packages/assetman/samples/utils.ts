import { SuiClient, SuiObjectDataOptions, SuiObjectResponse } from "@mysten/sui/dist/cjs/client";
import { Transaction, } from '@mysten/sui/transactions';
import { Ed25519Keypair } from "@mysten/sui/dist/cjs/keypairs/ed25519";

export async function listVaults(client: SuiClient, packageId: string, coinType?: string): Promise<SuiObjectResponse[]> {
	let {data, hasNextPage, nextCursor} = await client.queryEvents({
		query: {MoveEventType: `${packageId}::assetman::VaultAddEvent`}
	})

	const addPrefix = (hex: string): string => {
		if(hex[1] != 'x' && hex[1] != 'X')
			return "0x" + hex;
		return hex;
	}

	let events = data;
	if(!!coinType) {
		let typeParts = coinType.split("::");
		const pid = BigInt(addPrefix(typeParts[0]));
		//@ts-ignore
		events = data.filter(ev => {
			//@ts-ignore
			let typeParts2 = ev.parsedJson.coin.split("::");
			const pid2 = BigInt(addPrefix(typeParts2[0]));
			return pid === pid2
	});
	}

	//@ts-ignore
	let vaultIds = events.map(ev => ev.parsedJson?.vault);

	return await client.multiGetObjects({
		ids: vaultIds,
		options: {
			// showType: true,
			showContent: true,
		}
	})
}

export async function getOwnedObjects(
	client: SuiClient, 
	owner: string, 
	type?: string,
	options?: SuiObjectDataOptions,
): Promise<SuiObjectResponse[]> {
	let result: SuiObjectResponse[] = [];
	let cursor;
	let filter = !! type ? {StructType: type} : null;
	while(true) {
		let {data, nextCursor, hasNextPage} = await client.getOwnedObjects({
			owner,
			filter,
			options: {
				showType: true,
				...options
			},
			cursor
		});
		result = [...result, ...data];
		cursor = nextCursor;
		if(!hasNextPage)
			break;
	}
	return result;
}

export async function mergeCoins(client: SuiClient, keypair: Ed25519Keypair, mergeInto: SuiObjectResponse, coinsToMerge: SuiObjectResponse[], payment: SuiObjectResponse) {
    const tx = new Transaction();

	tx.mergeCoins(
		tx.object(mergeInto.data?.objectId!), 
		coinsToMerge.map(c => tx.object(c.data?.objectId!))
	);
	tx.setGasPayment([payment.data!]);
	tx.setGasBudget(2000000);

    return await client.signAndExecuteTransaction({
		transaction: tx,
		signer: keypair,
		requestType: 'WaitForLocalExecution',
		options: {
			showEffects: true,
			showEvents: true,
		},
    });
}

export function hex256(str: string): string {
	return BigInt(str).toString(16).padStart(64, '0')
}