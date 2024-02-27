import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as process from 'child_process';
import { platform } from 'node:process';

export function activate(context: vscode.ExtensionContext) {

	// Set context as a global as some tests depend on it
  (global as any).testExtensionContext = context;

	console.log(`Kubernetes Yaml Formatter X is now active!`);

  // Write the config file when the extension is activated
	writeConfigFile(context);

  // Watch for changes to the configuration file
	vscode.workspace.onDidChangeConfiguration(ev => {
      if (ev.affectsConfiguration('kubernetes-yaml-formatter-x')) {
        console.log(`rewrite config file since something changed just now`);
        writeConfigFile(context);
        return;
      }
	});
  console.log(`registered onDidChangeConfiguration`);
	vscode.languages.registerDocumentFormattingEditProvider('yaml', {
		provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
      console.log(`formatting ${document.fileName}`);
			const txt = document.getText();
      let args = [`-in`];
      // Check if the user has opted to use the local config
      let conf = vscode.workspace.getConfiguration();
      if (conf.get('kubernetes-yaml-formatter-x.config.useGlobalConfig')) {
        console.log(`Using global config file`);
        args.push(`-global_conf`);
      } else {
        console.log(`Using extension config`);
        const confFile = configFileLocation(context);
        if (confFile) {
          args.push(`-conf`);
          args.push(confFile);
        }
        console.log(`using local config: ${confFile}`);
      }

			// __dirname is `out`, so go back one level
			let cmd = path.join(path.dirname(__dirname), 'bin', 'yamlfmt');
			if (platform === 'win32') {
				cmd = path.join(path.dirname(__dirname), 'bin', 'yamlfmt.exe');
			}
      console.log(`using cmd: ${cmd}`);
      console.log(`using args: ${args}`);
      // Run the formatter and return the result
			const sp = process.spawnSync(cmd, args, {
				input: txt,
			});

      // If the formatter fails, log the error and return an empty array
			if (sp.status !== 0) {
				console.error(`format ${txt} fail: ${sp.stderr.toString()}`);
				return [];
			}

      // Paste the formatted text into the document
			const edits = vscode.TextEdit.replace(
				new vscode.Range(
					new vscode.Position(0, 0),
					new vscode.Position(document.lineCount, document.lineAt(document.lineCount - 1).text.length)
				), sp.stdout.toString(),
			);
			return [edits];
		}
	});
}

// Write the configuration file
function writeConfigFile(context: vscode.ExtensionContext) {
  // Get the path to the config file
	const file = configFileLocation(context);

  // If the file path is not defined, log an error and return
	if (!file) {
		console.error(`cannot get extension storage uri path`);
		return;
	}

  // Get the tab size from the user's settings
	const tabSize = vscode.workspace.getConfiguration("", {
		languageId: `yaml`,
	}).get(`editor.tabSize`, 2);

  // Read the user's settings and write them to the config file
	let conf = vscode.workspace.getConfiguration();
  const formatterType = conf.get('kubernetes-yaml-formatter-x.formatterType', 'basic');
  const retainLineBreaks = conf.get('kubernetes-yaml-formatter-x.retainLineBreaks', false);
  const retainLineBreaksSingle = conf.get('kubernetes-yaml-formatter-x.retainLineBreaksSingle', false);
  const scanFoldedAsLiteral = conf.get('kubernetes-yaml-formatter-x.scanFoldedAsLiteral', false);
  const indentlessArrays = conf.get('kubernetes-yaml-formatter-x.indentlessArrays', false);
  const disallowAnchors = conf.get('kubernetes-yaml-formatter-x.disallowAnchors', false);
  const maxLineLength = conf.get('kubernetes-yaml-formatter-x.maxLineLength', 80);
  const dropMergeTag = conf.get('kubernetes-yaml-formatter-x.dropMergeTag', false);
  const padLineComments = conf.get('kubernetes-yaml-formatter-x.padLineComments', false);
	const includeDocumentStart = conf.get('kubernetes-yaml-formatter-x.includeDocumentStart', false);
  // Get the EOL character from the user's settings
	let eof = "~";
	switch (conf.get('files.eol')) {
		case "\n":
			eof = "lf";
			break;
		case "\r\n":
			eof = "crlf";
			break;
		default:
			eof = "~";
			break;
	}
	try {
    // Write the config file
		fs.writeFileSync(file,
`formatter:
  type: ${formatterType}
  indent: ${tabSize}
  line_ending: ${eof}
  retain_line_breaks: ${retainLineBreaks}
  retain_line_breaks_single: ${retainLineBreaksSingle}
  scan_folded_as_literal: ${scanFoldedAsLiteral}
  include_document_start: ${includeDocumentStart}
  indentless_arrays: ${indentlessArrays}
  disallow_anchors: ${disallowAnchors}
  max_line_length: ${maxLineLength}
  drop_merge_tag: ${dropMergeTag}
  pad_line_comments: ${padLineComments}

`);
    console.error(`Wrote config file to ${file}`);
    (global as any).configFileLocation = file;
	} catch (err) {
		console.error(`write config: ${err}`);
		vscode.window.showErrorMessage(`Write config file: ${err}`);
	}
}

// Get the path to the configuration file
function configFileLocation(context: vscode.ExtensionContext): string | undefined {
	let fsPath = context.storageUri?.fsPath;
  // If the path is not defined, use the system temp directory
	if (!fsPath) {
		try {
      // Create a temporary directory for the extension
			fsPath = path.join(os.tmpdir(), context.extension.id);
			if (!fs.existsSync(fsPath)) {
        // Create the directory if it doesn't exist
				fs.mkdirSync(fsPath);
			}
		} catch (err) {
			throw new Error(`create tmp dir: ${err}`);
		}
		// maybe we are in the dev/debug mode.
		console.log(`cannot get extension storage uri fs path, fallback ${fsPath}`);
	}
	try {
		fs.mkdirSync(fsPath, { recursive: true });
	} catch (err) {
		console.error(`mkdir ${fsPath}: ${err}`);
		vscode.window.showErrorMessage(`mkdir extension storage uri path ${fsPath}: ${err}`);
	}
  // Return the path to the config file
	return path.join(fsPath, "config.yaml");
}

// this method is called when your extension is deactivated
export function deactivate(context: vscode.ExtensionContext) {
  // Remove the config file when the extension is deactivated
  let file = (global as any).configFileLocation;
  if (file) {
    try {
      fs.unlinkSync(file);
    } catch (err) {
      console.error(`unlink ${file}: ${err}`);
    }
  } else {
    console.error(`Cannot get extension storage uri path`);
  }
}
