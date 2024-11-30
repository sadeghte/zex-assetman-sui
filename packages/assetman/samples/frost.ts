// @ts-ignore
import * as frost from "frost-ed25519";

export function generateParticipantsList(maxSigners: number): string[] {
	return Array.from({length: maxSigners}, (v, i) => frost.numToIdentifier(i+1));
}

export function splitKey(key: string, maxSigners: number, minSigners: number) {
	let {shares, pubkey_package: pubkeyPackage} = frost.keysSplit(key, maxSigners, minSigners);

	let keyPackages = {};
	for(let [identifier, secretShare] of Object.entries(shares)) {
	
		let keyPackage = frost.keyPackageFrom(secretShare);
		// @ts-ignore
		keyPackages[identifier] = keyPackage;
	}

	return {keyPackages, pubkeyPackage}
}

export function keyGen(maxSigners: number, minSigners: number) {
	let {shares, pubkey_package: pubkeyPackage} = frost.keysGenerateWithDealer(maxSigners, minSigners);

	let keyPackages = {};
	for(let [identifier, secretShare] of Object.entries(shares)) {
	
		let keyPackage = frost.keyPackageFrom(secretShare);
		// @ts-ignore
		keyPackages[identifier] = keyPackage;
	}

	return {keyPackages, pubkeyPackage}
}

// @ts-ignore
export function signFrost(message: Buffer, keyPackages, pubkeyPackage): string {
	let noncesMap = {};
	let commitmentsMap = {};
	for (let participantIdentifier of Object.keys(keyPackages)) {
		let keyPackage = keyPackages[participantIdentifier];
		let {nonces, commitments} = frost.round1Commit(keyPackage.signing_share);
		// @ts-ignore
		noncesMap[participantIdentifier] = nonces;
		// @ts-ignore
		commitmentsMap[participantIdentifier] = commitments;
	}

	let signatureShares = {};
	let signingPackage = frost.signingPackageNew(commitmentsMap, message.toString('hex'));
	for (let participantIdentifier of Object.keys(noncesMap)) {
		let keyPackage = keyPackages[participantIdentifier];
		// @ts-ignore
		let nonces = noncesMap[participantIdentifier];
		let signatureShare = frost.round2Sign(signingPackage, nonces, keyPackage);
		// @ts-ignore
		signatureShares[participantIdentifier] = signatureShare;
	}

	return frost.aggregate(signingPackage, signatureShares, pubkeyPackage);

}

// @ts-ignore
export function verifyFrost(signature, message: Buffer, pubkeyPackage): boolean {
	return frost.verifyGroupSignature(signature, message.toString('hex'), pubkeyPackage);
}

// revert hex byte order
export function revertHex(hex: string): string {
	return Buffer.from(hex.padStart(64, '0'), 'hex').reverse().toString('hex');
}

if (require.main === module) {
	const secretStr = "6f1d069e50777944268319a0a3562aff01c08134ae9708b86ab493f5e245af7e";

	let minSigners = 3;
	let maxSigners = 5;

	let {keyPackages, pubkeyPackage} = splitKey(revertHex(secretStr), maxSigners, minSigners);
	console.log("publicKey: ", pubkeyPackage["verifying_key"])

	let message = Buffer.from("message to sign", 'utf-8');
	let wrongMessage = Buffer.from("a dummy message", 'utf-8');
	console.log(`message: "${message.toString()}"`, );

	let groupSignature = signFrost(message, keyPackages, pubkeyPackage);
	console.log("signature: ", groupSignature);

	// Check that the threshold signature can be verified by the group public
	// key (the verification key).
	let verified1 = verifyFrost(groupSignature, message, pubkeyPackage);
	let verified2 = verifyFrost(groupSignature, wrongMessage, pubkeyPackage);
		
	console.log("correct message verified: ", verified1);
	console.log("  wrong message verified: ", verified2);
}