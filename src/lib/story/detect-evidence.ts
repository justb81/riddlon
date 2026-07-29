/** Pure trigger check: does a player message in the group chat present the Hans evidence to Max? */
export function mentionsEvidence(text: string): boolean {
	return /beweis|hans|garderobe|jacke|halb zwölf|halb zwoelf/i.test(text);
}
